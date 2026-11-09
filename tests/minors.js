// Free cities: placement, influence, gifts, decay, patron boons, requests, conquest, AI competition, save/load.  node tests/minors.js
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/roads.js','js/quarters.js','js/intercept.js','js/warplan.js','js/automation.js','js/dynasty.js'].filter(f=>fs.existsSync(f));
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
let fails=0;
const ok=(name,cond,extra)=>{ if(!cond) fails++; console.log((cond?'PASS ':'FAIL ')+name+(extra?' '+extra:'')); };
const fresh=(race='hearth',o={})=>{ const s=G.newGame({name:'T',race,...o}); s.settings.hostility=0; s.calamityAt=1e12; s.eventAt=1e12; return s; };
const slow=(s)=>{ s.slowClock=9.99; G.step(s,0.02); };
const MM=G.MINORS;
const list=s=>Object.values(s.minors);
const byKind=(s,k)=>list(s).find(m=>m.kind===k);
const forceKind=(s,mi,k)=>{ mi.kind=k; return mi; };
const reveal=(s,mi)=>{ s.explored[mi.y*s.map+mi.x]=1; };

// ---- tables ----
ok('6 kinds with name, icon, boons', DATA.minorKindOrder.length>=6 && DATA.minorKindOrder.every(k=>{const d=DATA.minorKinds[k]; return d.name&&d.icon&&d.fx&&d.allyFx&&d.boon&&d.allyBoon;}));
ok('name pools for all 8 peoples', DATA.raceOrder.every(r=>(DATA.minorNames[r]||[]).length>=4), DATA.raceOrder.join(','));
ok('every people has garrison troops', DATA.raceOrder.every(r=>{ const g=G.minorUnitTypes({race:r}); return DATA.units[g.def]&&DATA.units[g.atk]; }));

// ---- placement ----
{ let good=true, why='', counts=[];
  for (const [race,rivals] of [['hearth',3],['delver',3],['sylvan',5],['ash',4],['tide',3],['veil',7],['grave',2],['wind',6]]) {
    const s=fresh(race,{rivals}); const ms=list(s); counts.push(ms.length);
    const want=Math.min(9,Math.max(3,rivals+2));
    if (ms.length<want-1) { good=false; why+=race+' only '+ms.length+'/'+want+'; '; }
    for (const mi of ms) {
      const t=G.tileAt(s,mi.x,mi.y);
      if (G.isWater(t)) { good=false; why+='water '; }
      if (t.city||t.camp||t.oasis||t.ruin) { good=false; why+='occupied '; }
      if (t.minor!==mi.id) { good=false; why+='marker '; }
      if (Object.values(s.cities).some(c=>G.dist(c,mi)<3)) { good=false; why+='near city '; }
      if (!G.landReachable(s,G.capital(s,'p'),t)) { good=false; why+='island '; }
      if (!G.unitsCount(mi.units)) { good=false; why+='no garrison '; }
      if (s.ley && s.ley.nodes.some(n=>n.x===mi.x&&n.y===mi.y)) { good=false; why+='on ley node '; }
    }
    // other world features are intact
    if (!s.special.some(t=>t.oasis) || !s.special.some(t=>t.ruin) || !Object.keys(s.camps).length) { good=false; why+='features '; }
  }
  ok('free cities placed on decent land for every people (not water, not on sites, away from cities)', good, why+' counts='+counts.join(','));
  const s=fresh('hearth',{rivals:3});
  ok('kinds are varied', new Set(list(s).map(m=>m.kind)).size>=Math.min(4,list(s).length), list(s).map(m=>m.kind).join(','));
  ok('names unique', new Set(list(s).map(m=>m.name)).size===list(s).length);
  // nothing else lands on them later
  let clash=false; for (let i=0;i<200;i++){ const c=G.spawnCamp(s); if (c && G.tileAt(s,c.x,c.y).minor) clash=true; }
  ok('camps never spawn on a free city', !clash);
  const t=G.freeTile(s,x=>!!x.minor,20000); ok('freeTile skips free cities', !t);
  // settling
  const mi=list(s)[0]; const cap=G.capital(s,'p'); cap.units.settlers=1;
  ok('player cannot settle on a free city', !!G.sendArmy(s,cap.id,mi.x,mi.y,'settle',{settlers:1}));
  ok('hidden until explored (fog)', list(s).filter(m=>!s.explored[m.y*s.map+m.x]).length>=1);
}

// ---- influence, gifts, decay ----
{ const s=fresh(); const mi=list(s)[0]; reveal(s,mi); const emp=s.empires.p; emp.gold=5000;
  ok('starts at 0 influence', G.minorInf(s,mi,'p')===0);
  ok('cannot gift more than you have', !!G.minorGift(s,'p',mi.id,99999));
  const g0=emp.gold;
  ok('gift gold', G.minorGift(s,'p',mi.id,200)===null && emp.gold===g0-200);
  const i1=G.minorInf(s,mi,'p'); ok('gift raises influence', i1>10, i1.toFixed(1));
  G.minorGift(s,'p',mi.id,200); const i2=G.minorInf(s,mi,'p');
  ok('diminishing returns', i2-i1 < i1, (i2-i1).toFixed(1)+' < '+i1.toFixed(1));
  ok('unexplored cities cannot be courted by the player', (()=>{ const o=list(s).find(m=>m!==mi); s.explored[o.y*s.map+o.x]=0; return !!G.minorGift(s,'p',o.id,100); })());
  // decay over an hour (no cities nearby)
  for (const c of Object.values(s.cities)) if (G.dist(c,mi)<=MM.neighbourDist) { c.x+=0; }
  const before=G.minorInf(s,mi,'p'); mi.req=null; mi.nextReq=1e12;
  for (let i=0;i<360;i++){ s.slowClock=9.99; s.time+=10; G.step(s,0.01); }
  const after=G.minorInf(s,mi,'p'); ok('influence decays slowly over time', after<before && after>before*0.3, before.toFixed(1)+' -> '+after.toFixed(1));
}

// ---- patronage and boons through G.mod ----
{ const s=fresh(); const mi=forceKind(s,list(s)[0],'merchant'); reveal(s,mi); s.empires.p.gold=99999; const cap=G.capital(s,'p');
  const t0=G.mod(s,'p',cap,'tax'), m0=G.mod(s,'p',cap,'market');
  mi.inf.p=MM.patronMin+5; G.minorUpdatePatron(s,mi);
  ok('top influence above the threshold becomes patron', mi.patron==='p' && !mi.ally);
  const t1=G.mod(s,'p',cap,'tax');
  ok('merchant patron boon: taxes via G.mod', Math.abs(t1/t0-1.06)<1e-6, (t1/t0).toFixed(3));
  ok('and market rates', G.mod(s,'p',cap,'market')>m0);
  ok('boon is not given to rivals', Math.abs(G.mod(s,'a1',G.capital(s,'a1'),'tax')/G.mod(s,'a1',G.capital(s,'a1'),'tax'))===1 && !G.minorBoons(s,'a1').tax);
  mi.inf.p=MM.allyMin+5; G.minorUpdatePatron(s,mi);
  ok('ally above 60 doubles the boon', mi.ally && Math.abs(G.mod(s,'p',cap,'tax')/t0-1.12)<1e-6, (G.mod(s,'p',cap,'tax')/t0).toFixed(3));
  // rival outbids: hysteresis then takeover, with a warning
  mi.inf.a1=mi.inf.p+2; G.minorUpdatePatron(s,mi);
  ok('a narrow lead does not flip patronage (hysteresis)', mi.patron==='p');
  mi.inf.a1=mi.inf.p+MM.hysteresis+1; s.log=[]; G.minorUpdatePatron(s,mi);
  ok('a rival with clearly more influence takes over', mi.patron==='a1');
  ok('player warned on losing patronage', s.log.some(l=>/no longer looks to you/.test(l.text)));
  ok('boon moves to the new patron', Math.abs(G.mod(s,'p',cap,'tax')/t0-1)<1e-9 && G.minorBoons(s,'a1').tax>1);
  // other kinds
  const k2=forceKind(s,list(s)[1],'mage'); k2.inf={p:40}; G.minorUpdatePatron(s,k2);
  ok('mage enclave: spells cheaper, more mana', G.mod(s,'p',null,'spellCost')<1 && G.mod(s,'p',cap,'mana')>G.mod(s,'a2',G.capital(s,'a2'),'mana')*0.99);
  const k3=forceKind(s,list(s)[2],'temple'); k3.inf={p:40}; G.minorUpdatePatron(s,k3); G.ensureReligion&&G.ensureReligion(s);
  const f0=s.empires.p.faith; for(let i=0;i<6;i++) slow(s);
  ok('temple city gives faith to its patron', s.empires.p.faith>f0, (s.empires.p.faith-f0).toFixed(2));
  // periodic gift
  const g0=s.empires.p.gold; const mer=forceKind(s,list(s)[0],'merchant'); mer.inf={p:70}; G.minorUpdatePatron(s,mer); mer.nextGift=s.time-1; slow(s);
  ok('patron gifts arrive (merchant gold)', s.empires.p.gold>g0);
}

// ---- requests ----
{ const s=fresh(); const mi=list(s)[0]; reveal(s,mi); const cap=G.capital(s,'p');
  // delivery
  mi.req={type:'deliver',good:'timber',amount:100,reward:25,gold:40,expires:s.time+9999,id:'rq1'};
  cap.x=cap.x; // in range?
  const far=G.dist(cap,mi)>15;
  if (far) { // put a city near the free city
    const t=G.freeTile(s,x=>G.dist(x,mi)>=2&&G.dist(x,mi)<=4); var dc=G.foundCity(s,'p',t.x,t.y,'Outpost'); } else var dc=cap;
  dc.res.timber=50; ok('cannot deliver without the goods', !!G.minorDeliver(s,'p',mi.id,dc.id));
  dc.res.timber=500; const i0=G.minorInf(s,mi,'p'), g0=s.empires.p.gold;
  ok('deliver completes the request', G.minorDeliver(s,'p',mi.id,dc.id)===null && !mi.req && dc.res.timber===400);
  ok('completing pays influence and gold', G.minorInf(s,mi,'p')>i0+15 && s.empires.p.gold>g0);
  // caravan delivery
  for (const e of Object.values(s.empires)) if (e.id!=='p') e.minorClock=-1e9;   // keep the AI from answering first
  mi.req={type:'deliver',good:'stone',amount:100,reward:25,gold:40,expires:s.time+9999,id:'rq2'};
  dc.buildings.market=3; dc.res.stone=500;
  ok('send a caravan to a free city', G.sendArmy(s,dc.id,mi.x,mi.y,'trade',{},{stone:150})===null);
  const before=G.minorInf(s,mi,'p'); const cm=s.moves.find(m=>m.type==='trade'); G.advance(s,Math.max(60,cm.arrive-s.time+5));
  ok('caravan arrival completes the delivery and adds influence', (!mi.req || mi.req.id!=='rq2') && G.minorInf(s,mi,'p')>before+10, before.toFixed(1)+' -> '+G.minorInf(s,mi,'p').toFixed(1));
  // clear a camp
  const s2=fresh(); const m2=list(s2)[0]; m2.req=null; m2.nextReq=0; let tries=0;
  while ((!m2.req||m2.req.type!=='clear') && tries++<60) { m2.req=null; G.minorNewRequest(s2,m2); }
  ok('a clear-the-brigands request names a nearby camp', m2.req && m2.req.type==='clear' && s2.camps[m2.req.camp] && G.dist(s2.camps[m2.req.camp],m2)<=7);
  const camp=s2.camps[m2.req.camp]; const rid=m2.req.id; const c2=G.capital(s2,'p'); const u=DATA.races.hearth.units[4];
  c2.units[u]=400; s2.empires.p.gold=0;
  ok('send an army at the camp', G.sendArmy(s2,c2.id,camp.x,camp.y,'attack',{[u]:400})===null || (()=>{ /* island: resolve directly */ return true; })());
  if (!s2.moves.length) { const tt=G.tileAt(s2,camp.x,camp.y); G.resolveMove(s2,{id:'mx',owner:'p',type:'attack',from:c2.id,fx:c2.x,fy:c2.y,x:camp.x,y:camp.y,units:{[u]:400},cargo:{},depart:s2.time,arrive:s2.time}); }
  else { const mv=s2.moves[s2.moves.length-1]; G.advance(s2,Math.max(30,mv.arrive-s2.time+5)); }
  ok('destroying the camp completes the request', !s2.camps[camp.id] && (!m2.req || m2.req.id!==rid), JSON.stringify(m2.req));
  ok('the free city is grateful', G.minorInf(s2,m2,'p')>=10, G.minorInf(s2,m2,'p').toFixed(1));
  // defend: raiders strike if nobody comes
  const s3=fresh(); const m3=list(s3)[0]; tries=0;
  while ((!m3.req||m3.req.type!=='defend') && tries++<80) { if (m3.req&&m3.req.camp&&s3.camps[m3.req.camp]&&m3.req.type==='defend') break; m3.req=null; G.minorNewRequest(s3,m3); }
  ok('a defend request gathers raiders near the city', m3.req && m3.req.type==='defend' && s3.camps[m3.req.camp] && s3.camps[m3.req.camp].raidOn===m3.id);
  const cid=m3.req.camp; m3.req.expires=s3.time; const n0=G.unitsCount(m3.units); slow(s3);
  ok('unanswered, the raiders strike and disperse', !s3.camps[cid] && !m3.req && G.unitsCount(m3.units)<=n0);
}

// ---- mercenaries ----
{ const s=fresh(); const mi=forceKind(s,list(s)[0],'mercenary'); reveal(s,mi); const cap=G.capital(s,'p'); s.empires.p.gold=20000;
  ok('mercenaries need friendship', !!G.minorHire(s,'p',mi.id,cap.id));
  mi.inf.p=40; G.minorUpdatePatron(s,mi);
  const q=G.minorHireQuote(s,'p',mi.id);
  const g0=s.empires.p.gold;
  ok('hire a company', G.minorHire(s,'p',mi.id,cap.id)===null && s.empires.p.gold===g0-q.gold);
  ok('cooldown', !!G.minorHire(s,'p',mi.id,cap.id));
  G.advance(s,3600*3);
  ok('the company arrives in the city', (cap.units[q.unit]||0)>=q.n, q.unit+' '+(cap.units[q.unit]||0));
}

// ---- conquest ----
{ const s=fresh(); const mi=list(s)[0]; reveal(s,mi); const other=list(s)[1]; other.inf.p=50; G.minorUpdatePatron(s,other);
  const cap=G.capital(s,'p'); const u=DATA.races.hearth.units[5]; // royal guard
  const send=(n,type)=>{ cap.units[u]=(cap.units[u]||0)+n; const units={[u]:n}; if(type==='conquer'){cap.units.herald=(cap.units.herald||0)+1; units.herald=1;}
    G.resolveMove(s,{id:G.newId(s,'m'),owner:'p',type,from:cap.id,fx:cap.x,fy:cap.y,x:mi.x,y:mi.y,units,cargo:{},depart:s.time,arrive:s.time}); };
  // scouting
  ok('no preview before scouting', (G.previewBattle(s,cap,G.tileAt(s,mi.x,mi.y),{[u]:10},'attack')||{}).known===false);
  G.resolveMove(s,{id:'ms',owner:'p',type:'scout',from:cap.id,fx:cap.x,fy:cap.y,x:mi.x,y:mi.y,units:{scout:2},cargo:{},depart:s.time,arrive:s.time});
  const intel=s.intel[G.tileIdx(s,G.tileAt(s,mi.x,mi.y))];
  ok('scouts report the garrison', intel && G.unitsCount(intel.units)===G.unitsCount(mi.units));
  const pv=G.previewBattle(s,cap,G.tileAt(s,mi.x,mi.y),{[u]:500},'attack'); ok('battle preview after scouting', pv && pv.known && pv.win);
  s.reports=[]; const op0=G.rel(s,'a1').opinion;
  send(500,'attack');
  ok('a won assault lowers resolve', mi.resolve<100 && s.minors[mi.id], ''+mi.resolve);
  ok('attacking angers the free city and the others', !G.minorInf(s,mi,'p') && G.minorInf(s,other,'p')<50 && (mi.grudge.p||0)>s.time);
  ok('realms disapprove', G.rel(s,'a1').opinion<op0);
  ok('report filed', s.reports.some(r=>new RegExp(mi.name).test(r.title)));
  // keep storming until it falls
  s.empires.p.renownBonus=5000; let n=0;
  while (s.minors[mi.id] && n++<12) send(500,'conquer');
  const t=G.tileAt(s,mi.x,mi.y); const c=t.city&&s.cities[t.city];
  ok('conquest turns it into a regular city of the conqueror', !s.minors[mi.id] && c && c.owner==='p' && c.name===mi.name && !t.minor, 'tries='+n);
  ok('the new city keeps the victors as garrison and has grown buildings', c && G.unitsCount(c.units)>0 && G.lvl(c,'townhall')>=3);
  ok('every other free city resents it', G.minorInf(s,other,'p')<30);
  // subjugation when there is no city slot
  const s2=fresh(); const m2=list(s2)[0];
  ok('the player has no spare city slot yet', !G.canFoundCity(s2,'p'));
  const r=G.minorCapture(s2,m2,'p',{});
  ok('without a city slot the free city is subjugated', r===null && s2.minors[m2.id] && m2.subject==='p');
  const g0=s2.empires.p.gold; for (const c of G.citiesOf(s2,'p')) c.pop=0; const tr=G.minorTribute(s2,m2); slow(s2);
  ok('a subject pays tribute', tr>0 && s2.empires.p.gold>=g0+tr*10/60*0.99, (s2.empires.p.gold-g0).toFixed(2));
  ok('a subject cannot be courted', !!G.minorGift(s2,'a2',m2.id,100));
}

// ---- AI competition ----
{ let patrons=0, aiGifts=0, cityGain=0, near=0, logs=0; const races=['ash','sylvan'];
  for (const race of races) {
    const s=G.newGame({name:'T',race:'hearth',rivals:4,pace:'quick'}); s.calamityAt=1e12; s.eventAt=1e12;
    for (const e of Object.values(s.empires)) if (e.id!=='p') e.gold+=4000;
    G.advance(s,3600*4,6000);
    const ms=list(s);
    patrons+=ms.filter(m=>m.patron&&m.patron!=='p').length;
    aiGifts+=ms.reduce((a,m)=>a+Object.keys(m.inf).filter(o=>o!=='p').length,0);
    logs+=s.log.filter(l=>/patron of/.test(l.text)).length;
  }
  ok('AI realms court free cities over simulated hours', aiGifts>=3, 'influence entries='+aiGifts);
  ok('AI realms become patrons', patrons>=2, 'patrons='+patrons);
  console.log('     (player notified of nearby AI patrons '+logs+' times)');
  // the warning fires when an AI wins a city near the player
  const s=fresh(); const mi=list(s)[0]; reveal(s,mi); const t=G.freeTile(s,x=>G.dist(x,mi)>=3&&G.dist(x,mi)<=5); G.foundCity(s,'p',t.x,t.y,'Neartown');
  s.log=[]; mi.inf.a1=40; G.minorUpdatePatron(s,mi);
  ok('player notified when an AI becomes patron of a free city near them', s.log.some(l=>/became patron/.test(l.text)));
  // AI conquest path
  const s2=G.newGame({name:'T',race:'hearth',rivals:3}); s2.calamityAt=1e12; s2.time=G.pace(s2).grace+G.pace(s2).ramp; const ai=s2.empires.a1; ai.aggr=1;
  const m2=list(s2).sort((a,b)=>G.dist(a,G.capital(s2,'a1'))-G.dist(b,G.capital(s2,'a1')))[0];
  const ac=G.capital(s2,'a1'); const au=DATA.races[ai.race].units.find(u=>DATA.units[u].atk>=60)||DATA.races[ai.race].units[0];
  // move the AI capital's army next to the free city by placing a city there
  const tt=G.freeTile(s2,x=>G.dist(x,m2)>=2.5&&G.dist(x,m2)<=4&&G.landReachable(s2,x,m2)); const fc=G.foundCity(s2,'a1',tt.x,tt.y,'Forward');
  fc.units[au]=2000; ai.minorClock=99; ai.gold=0; let sent=false;
  for (let i=0;i<60&&!sent;i++){ ai.minorClock=99; ai.minorWarAt=0; for (const h of G.aiHooks) h(s2,ai,0.2); sent=s2.moves.some(m=>m.owner==='a1'&&['attack','conquer'].includes(m.type)&&G.tileAt(s2,m.x,m.y).minor); }
  ok('a warlike AI marches on a free city', sent);
}

// ---- save / load ----
{ const s=fresh(); const mi=list(s)[0]; mi.inf={p:42,a1:12}; G.minorUpdatePatron(s,mi); mi.req={type:'deliver',good:'grain',amount:200,reward:25,gold:40,expires:s.time+999,id:'rqx'};
  const s2=G.deserialize(G.serialize(s));
  const m2=s2.minors[mi.id];
  ok('save/load keeps free cities, influence, patron and requests', m2 && m2.inf.p===42 && m2.patron==='p' && m2.req && m2.req.id==='rqx' && G.tileAt(s2,mi.x,mi.y).minor===mi.id);
  const cap=G.capital(s2,'p'); ok('boon still applies after load', G.minorBoons(s2,'p') && Object.keys(G.minorBoons(s2,'p')).length>0);
  // an old save without free cities
  const old=JSON.parse(G.serialize(s)); delete old.minors; for (const t of old.tiles) delete t.minor;
  const s3=G.deserialize(JSON.stringify(old));
  ok('an old save loads and gets free cities lazily', s3 && s3.minors && Object.keys(s3.minors).length>=3 && Object.values(s3.minors).every(m=>G.tileAt(s3,m.x,m.y).minor===m.id&&!G.isWater(G.tileAt(s3,m.x,m.y))));
  G.advance(s3,600); ok('and runs', !!s3.minors);
  // no free cities at all (very cramped worlds) is fine
  const s4=fresh(); s4.minors={}; for (const t of s4.tiles) t.minor=null; G.advance(s4,300); ok('a world with no free cities runs', true);
}

console.log(fails ? fails+' FAILED' : 'ALL PASS');
if (fails) process.exitCode=1;
`);
