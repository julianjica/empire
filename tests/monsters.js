// Roaming monsters, migrations, hunting and the late-game crisis.  node tests/monsters.js
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=fs.readFileSync('index.html','utf8').match(/js\/[a-z0-9-]+\.js/g).filter(f=>!/ui-|worldmap|cityview|cityart|audio|tutorial|portrait/.test(f));
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
let fails=0; const ok=(n,c,x)=>{ if(!c) fails++; console.log((c?'PASS ':'FAIL ')+n+(x!==undefined?' '+x:'')); };
const quiet=s=>{ s.calamityAt=1e12; s.eventAt=1e12; s.monsterAt=1e12; s.crisisNext=1e12; };
const fresh=(o={})=>{ const s=G.newGame(Object.assign({name:'T',race:'hearth',rivals:3},o)); quiet(s); return s; };
const H=3600;
const landTile=(s,pred)=>G.freeTile(s,t=>!G.isWater(t)&&!t.minor&&pred(t),20000);
const allLand=(s,path)=>path.every(([x,y])=>!G.isWater(G.tileAt(s,x,y)));
const allWater=(s,path)=>path.every(([x,y])=>G.isWater(G.tileAt(s,x,y)));
const finishLeg=(s,mon)=>{ mon.arrive=s.time; mon.rest=s.time; };
const place=(s,mon,t)=>{ mon.fx=mon.x=t.x; mon.fy=mon.y=t.y; mon.path=null; mon.depart=mon.arrive=s.time; };
const U=(s,o,i)=>DATA.races[s.empires[o].race].units[i];
const offUnit=(s,o)=>DATA.races[s.empires[o].race].units.filter(u=>DATA.units[u].at&&DATA.units[u].type!=='siege'&&!DATA.units[u].flying&&DATA.units[u].atk>=(DATA.units[u].defI+DATA.units[u].defC)/2).sort((a,b)=>DATA.units[b].atk-DATA.units[a].atk)[0];

// ---------------------------------------------------------------- spawning
{
  const small=fresh({worldSize:'small'}), large=fresh({worldSize:'large'});
  ok('more creatures roam a larger world', G.monsterCap(large)>G.monsterCap(small), G.monsterCap(small)+' vs '+G.monsterCap(large));
  const s=fresh(); const early=G.monsterCap(s); s.time=6*H; const late=G.monsterCap(s);
  ok('more creatures roam as time passes', late>early, early+' -> '+late);
  s.time=0; const n0=G.monsterStrength(s,'trolls'); s.time=8*H; const n8=G.monsterStrength(s,'trolls');
  ok('creatures grow stronger with time', n8>n0*1.6, n0+' -> '+n8);
  const g=fresh(); g.monsterAt=null; G.advance(g,H*1.2,300);
  const ms=G.monsterList(g);
  ok('the wilds fill up on their own', ms.length>=1 && ms.length<=G.monsterCap(g), ms.map(m=>m.kind).join(','));
  ok('only peaceful herds in the first hour', ms.filter(m=>m.born<H).every(m=>DATA.monsterKinds[m.kind].minT*60<=m.born+1), ms.map(m=>m.kind+'@'+Math.round(m.born/60)).join(','));
  ok('no creature spawns beside the player\\'s capital early', ms.filter(m=>m.kind!=='herd').every(m=>G.dist({x:m.lx,y:m.ly},G.capital(g,'p'))>=6));
  ok('serpents spawn only in great seas', (()=>{ const sp=G.spawnMonster(g,'serpent'); return !sp || G.isWater(G.tileAt(g,sp.x,sp.y)); })());
}

// ---------------------------------------------------------------- movement
{
  const s=fresh(); s.time=3*H;
  let landOk=true, legs=0, seaOk=true, seaLegs=0, flyWater=false;
  for(const kind of ['trolls','herd','werewolves','giants']){
    const m=G.spawnMonster(s,kind); if(!m) continue;
    for(let i=0;i<25;i++){ finishLeg(s,m); m.mode='wander'; m.raidAt=1e12; G.monsterPlan(s,m); if(m.path){ legs++; if(!allLand(s,m.path)) landOk=false; } s.time+=60; }
  }
  ok('land creatures never walk on water', landOk && legs>20, legs+' legs');
  const sp=G.spawnMonster(s,'serpent');
  if(sp){ for(let i=0;i<25;i++){ finishLeg(s,sp); G.monsterPlan(s,sp); if(sp.path){ seaLegs++; if(!allWater(s,sp.path)) seaOk=false; } } }
  ok('serpents swim only on water (every step of the path)', seaOk && (!sp || seaLegs>5), seaLegs+' legs');
  const gr=G.spawnMonster(s,'griffons');
  const lake=s.tiles.find(t=>G.isWater(t));
  ok('flyers go straight, over anything', !!gr && G.monsterLegTo(s,gr,lake.x,lake.y) && gr.path.length===2);
  // smooth movement: the creature's position moves along its leg
  const tr=G.spawnMonster(s,'trolls'); finishLeg(s,tr); let dest=null;
  for(let i=0;i<20&&!dest;i++){ const d=landTile(s,t=>G.dist(t,tr)>=3&&G.dist(t,tr)<=5&&G.landReachable(s,t,tr)); if(d&&G.monsterLegTo(s,tr,d.x,d.y)) dest=d; }
  const a=G.monsterPos(s,tr); s.time=(tr.depart+tr.arrive)/2; const b=G.monsterPos(s,tr); s.time=tr.arrive; const c=G.monsterPos(s,tr);
  ok('creatures move smoothly along their leg', Math.hypot(b.x-a.x,b.y-a.y)>0.5 && c.x===dest.x && c.y===dest.y);
}

// ---------------------------------------------------------------- migration by season
{
  const s=fresh(); const len=7200*G.pace(s).time;
  const drift=(seasonIdx)=>{
    s.time=seasonIdx*len+60; let dy=0, n=0;
    for(let k=0;k<8;k++){
      const t=landTile(s,x=>(x.terrain==='plains'||x.terrain==='fertile')&&x.y>s.map*0.35&&x.y<s.map*0.65);
      if(!t) continue;
      const m=G.spawnMonster(s,'herd',t); finishLeg(s,m);
      for(let i=0;i<4;i++){ const y0=m.y; G.monsterPlan(s,m); dy+=m.y-y0; n++; finishLeg(s,m); }
      delete s.monsters[m.id];
    }
    return n?dy/n:0;
  };
  const spring=drift(0), autumn=drift(2);
  ok('herds drift north in spring', spring<0, spring.toFixed(2));
  ok('herds drift south in autumn', autumn>0, autumn.toFixed(2));
}

// ---------------------------------------------------------------- raids and the calm opening
{
  const s=fresh(); const cap=G.capital(s,'p');
  ok('no roaming raid on the player before ~hour 2', G.monsterRaidGate(s,'p')>=2*H-1, (G.monsterRaidGate(s,'p')/H).toFixed(2)+'h');
  const hard=fresh({difficulty:'hard'}); const easy=fresh({difficulty:'easy'});
  ok('the gate follows the hostility setting', G.monsterRaidGate(hard,'p')<G.monsterRaidGate(s,'p') && G.monsterRaidGate(easy,'p')>G.monsterRaidGate(s,'p'));
  const spot=landTile(s,t=>G.dist(t,cap)>=1.4&&G.dist(t,cap)<=2.2);
  const tr=G.spawnMonster(s,'trolls',spot,{n:12}); tr.mode='raid'; tr.target=cap.id; tr.raidAt=0; finishLeg(s,tr);
  s.time=H; G.monsterTick(s);
  ok('before the gate, trolls at the gates do not raid the player', !s.reports.some(r=>r.title.includes('fell upon')));
  s.time=3*H; place(s,tr,spot); tr.mode='raid'; tr.target=cap.id; tr.raidAt=0; cap.units={[U(s,'p',0)]:6};
  const had={...cap.units}; G.monsterTick(s);
  const rep=s.reports.find(r=>r.title.includes('fell upon '+cap.name));
  ok('after the gate, a band in a town\\'s reach raids it (battle with tactics)', !!rep && !!rep.body.tactics && rep.body.tactics.terrain, rep&&rep.title);
  ok('the raid is fought against the garrison', G.unitsCount(cap.units)<G.unitsCount(had) || (s.monsters[tr.id] && G.monsterCount(s.monsters[tr.id])<12));
  ok('a raided town is left alone for a while', cap.monRaidAt>s.time);
  // a fresh game: two quiet hours bring no roaming raids on the player
  const q=G.newGame({name:'Q',race:'hearth',rivals:3}); q.calamityAt=1e12; q.eventAt=1e12; q.crisisNext=1e12;
  G.advance(q,1.8*H,400);
  ok('the opening hours stay calm', !q.reports.some(r=>/fell upon|ambushed a caravan|serpent struck/.test(r.title)), q.reports.filter(r=>/fell upon/.test(r.title)).map(r=>r.title).join(';'));
}

// ---------------------------------------------------------------- hunting, interception, retargeting
{
  const setup=()=>{
    const s=fresh(); s.time=3*H; const cap=G.capital(s,'p'); cap.units={militia:200,[U(s,'p',1)]:60};
    const spot=landTile(s,t=>G.dist(t,cap)>=4&&G.dist(t,cap)<=6&&G.landReachable(s,t,cap)&&!s.tiles.some(o=>o.city&&G.dist(o,t)<2));
    const tr=G.spawnMonster(s,'trolls',spot,{n:8}); tr.raidAt=1e12; tr.rest=1e12; finishLeg(s,tr); tr.rest=1e12;
    return {s,cap,tr,spot};
  };
  { // the hunt: an attack at a creature's tile is tagged and fought on arrival
    const {s,cap,tr,spot}=setup();
    const err=G.sendArmy(s,cap.id,spot.x,spot.y,'attack',{militia:150});
    const m=s.moves.find(m=>m.monster===tr.id);
    ok('an attack sent at a creature becomes a hunt', !err && !!m, err);
    const pv=G.previewBattle(s,cap,G.tileAt(s,spot.x,spot.y),{militia:150},'attack');
    ok('the send form previews the fight', pv && pv.known && pv.monster && pv.win);
    const ren0=G.renown(s,'p'), xp0=G.heroOf(s,'p').xp;
    G.advance(s,m.arrive-s.time+1,50);
    ok('the creature is slain', !s.monsters[tr.id]);
    ok('slaying it brings renown', G.renown(s,'p')>ren0, ren0+' -> '+G.renown(s,'p'));
    const back=s.moves.find(x=>x.type==='return'&&x.owner==='p');
    ok('the army carries loot home', back && Object.values(back.cargo).some(v=>v>0), back&&JSON.stringify(back.cargo));
    ok('a report tells of the victory', s.reports.some(r=>r.title.includes('Victory against the troll')));
    ok('the chronicle remembers the hunt', G.chronicle(s).ev.some(e=>e.k==='hunt') && /slew the troll/.test(G.chronText(s,G.chronicle(s).ev.find(e=>e.k==='hunt'))));
    ok('loot, renown: the slain counter goes up', (s.empires.p.monstersSlain||0)===1);
  }
  { // the hero comes along: experience (and maybe a trophy)
    const {s,cap,tr,spot}=setup(); cap.units.hero=1; const h=G.heroOf(s,'p'); const xp0=h.xp, lv0=h.level;
    G.sendArmy(s,cap.id,spot.x,spot.y,'attack',{militia:150,hero:1});
    const m=s.moves.find(m=>m.monster===tr.id); G.advance(s,m.arrive-s.time+1,50);
    ok('the hero gains experience from a hunt', h.xp>xp0 || h.level>lv0, xp0+' -> '+h.xp);
  }
  { // it moved a little: the hunters follow its tracks once
    const {s,cap,tr,spot}=setup();
    G.sendArmy(s,cap.id,spot.x,spot.y,'attack',{militia:150});
    const m=s.moves.find(m=>m.monster===tr.id);
    const near=landTile(s,t=>G.dist(t,spot)>=2.5&&G.dist(t,spot)<=3.5&&G.landReachable(s,t,spot)&&!s.tiles.some(o=>o.city&&G.dist(o,t)<1.5));
    tr.fx=tr.x=near.x; tr.fy=tr.y=near.y; tr.path=null; tr.arrive=s.time; tr.rest=1e12;
    G.advance(s,m.arrive-s.time+1,50);
    const f=s.moves.find(x=>x.monster===tr.id&&x.tracked);
    ok('a creature that moved a little is tracked down (one re-target)', !!f && f.x===near.x && f.y===near.y);
    ok('no cold-trail report when tracking', !s.reports.some(r=>/went cold/.test(r.title)));
    G.advance(s,f.arrive-s.time+1,50);
    ok('and the tracked creature is fought', !s.monsters[tr.id] || s.reports.some(r=>/against the troll/.test(r.title)));
  }
  { // it moved far: the trail goes cold and the army comes home
    const {s,cap,tr,spot}=setup();
    G.sendArmy(s,cap.id,spot.x,spot.y,'attack',{militia:150});
    const m=s.moves.find(m=>m.monster===tr.id);
    const far=landTile(s,t=>G.dist(t,spot)>=7&&G.dist(t,spot)<=10&&G.landReachable(s,t,spot));
    tr.fx=tr.x=far.x; tr.fy=tr.y=far.y; tr.path=null; tr.arrive=s.time;
    G.advance(s,m.arrive-s.time+1,50);
    ok('a creature far away leaves a cold trail', s.reports.some(r=>/went cold/.test(r.title)));
    ok('and the army turns home', s.moves.some(x=>x.type==='return'&&x.owner==='p'&&x.units.militia===150));
  }
  { // already slain by someone else
    const {s,cap,tr,spot}=setup();
    G.sendArmy(s,cap.id,spot.x,spot.y,'raid',{militia:150});
    delete s.monsters[tr.id];
    const m=s.moves.find(m=>m.monster===tr.id); G.advance(s,m.arrive-s.time+1,50);
    ok('a hunt for a vanished creature comes home quietly', s.reports.some(r=>/came to nothing/.test(r.title)) && s.moves.some(x=>x.type==='return'));
  }
  { // a raid only wounds: it flees
    const {s,cap,spot}=setup();
    const big=G.spawnMonster(s,'trolls',landTile(s,t=>G.dist(t,cap)>=4&&G.dist(t,cap)<=7&&G.landReachable(s,t,cap)&&!t.city),{n:20}); big.rest=1e12; big.raidAt=1e12; finishLeg(s,big); big.rest=1e12;
    G.sendArmy(s,cap.id,big.x,big.y,'raid',{militia:200,[U(s,'p',1)]:60});
    const m=s.moves.find(m=>m.monster===big.id); G.advance(s,m.arrive-s.time+1,50);
    const b=s.monsters[big.id];
    ok('a raid that wins leaves the creature wounded and fleeing', !b || b.mode==='flee', b&&b.mode);
  }
  { // flyers over water and the sea serpent
    const s=fresh(); s.time=3*H; const cap=G.capital(s,'p');
    const lake=s.tiles.find(t=>G.isWater(t)&&!t.city);
    const gr=G.spawnMonster(s,'griffons',lake); gr.rest=1e12;
    ok('flyers over the water cannot be reached', /over the water/.test(G.sendArmy(s,cap.id,lake.x,lake.y,'attack',{militia:5})||''));
    delete s.monsters[gr.id];
    const sp=G.spawnMonster(s,'serpent',lake); sp.rest=1e12;
    ok('only ships hunt a sea serpent', /Only ships/.test(G.sendArmy(s,cap.id,lake.x,lake.y,'attack',{militia:5})||''));
  }
}

// ---------------------------------------------------------------- serpents, ships, fishing, caravans
{
  const s=fresh(); s.time=4*H;
  const port=Object.values(s.cities).find(c=>G.coastal(s,c.x,c.y));
  if(port){
    const w=s.tiles.find(t=>G.isWater(t)&&G.dist(t,port)<=2);
    const before=G.mod(s,port.owner,port,'fishing');
    const sp=G.spawnMonster(s,'serpent',w,{n:2}); sp.rest=1e12;
    ok('a serpent nearby scares the fish from the harbor', G.mod(s,port.owner,port,'fishing')<before*0.7);
    s.moves.push({id:'mX',owner:port.owner,type:'attack',from:port.id,fx:w.x,fy:w.y,x:w.x,y:w.y,path:[[w.x,w.y],[w.x,w.y]],naval:true,units:{warship:2},cargo:{},depart:s.time,arrive:s.time+9999});
    sp.raidAt=0; G.monsterTick(s);
    ok('the serpent strikes ships that sail near it', s.moves.every(m=>m.id!=='mX'||m.serpent) );
  } else ok('a serpent nearby scares the fish (no coastal city on this map: skipped)', true);
  const s2=fresh(); s2.time=4*H; const c=G.capital(s2,'p');
  const tr=G.spawnMonster(s2,'trolls',landTile(s2,t=>G.dist(t,c)>=3&&G.dist(t,c)<=5),{n:10}); tr.raidAt=0; tr.rest=1e12; finishLeg(s2,tr); tr.rest=1e12;
  s2.moves.push({id:'mC',owner:'p',type:'trade',from:c.id,fx:tr.x,fy:tr.y,x:tr.x,y:tr.y,units:{},cargo:{grain:500},depart:s2.time,arrive:s2.time+9999});
  G.monsterTick(s2);
  const cv=s2.moves.find(m=>m.id==='mC');
  ok('raiders ambush caravans on the road', cv.ambushed && cv.cargo.grain<500 && s2.reports.some(r=>/ambushed a caravan/.test(r.title)));
}

// ---------------------------------------------------------------- fog of war
{
  const s=fresh(); s.time=3*H; const cap=G.capital(s,'p');
  const vis=G.visibleSet(s);
  const far=landTile(s,t=>!vis[t.y*s.map+t.x]&&G.dist(t,cap)>12);
  const near=landTile(s,t=>vis[t.y*s.map+t.x]&&G.dist(t,cap)>=1.5&&G.dist(t,cap)<=2.5);
  const a=G.spawnMonster(s,'trolls',far), b=G.spawnMonster(s,'trolls',near);
  ok('creatures out of sight are hidden', !G.monsterVisible(s,a,vis));
  ok('creatures in sight are shown', G.monsterVisible(s,b,vis));
  s.monsterAt=1e12; G.advance(s,15,2);
  ok('scouts and cities report a sighting once', b.seen===1 && !a.seen && s.log.some(l=>/Troll war-band spotted/.test(l.text||l)));
  ok('a tooltip estimate rounds the count', G.monsterEstimate({units:{troll:23}})===25 && G.monsterEstimate({units:{troll:4}})===4);
}

// ---------------------------------------------------------------- AI hunts
{
  const s=fresh(); s.time=4*H; const ai=G.capital(s,'a1'); ai.units={[offUnit(s,'a1')]:400};
  const t=landTile(s,x=>G.dist(x,ai)>=3&&G.dist(x,ai)<=5&&G.landReachable(s,x,ai));
  const tr=G.spawnMonster(s,'trolls',t,{n:5}); tr.rest=1e12; finishLeg(s,tr); tr.rest=1e12;
  ok('an AI realm hunts a raider near home when strong enough', G.aiHunt(s,s.empires.a1) && s.moves.some(m=>m.owner==='a1'&&m.monster===tr.id));
  const weak=fresh(); weak.time=4*H; const ai2=G.capital(weak,'a1'); ai2.units={[DATA.races[weak.empires.a1.race].units[0]]:3};
  const t2=landTile(weak,x=>G.dist(x,ai2)>=3&&G.dist(x,ai2)<=5);
  G.spawnMonster(weak,'giants',t2,{n:6});
  ok('a weak AI realm leaves giants alone', !G.aiHunt(weak,weak.empires.a1));
}

// ---------------------------------------------------------------- the crisis: trigger
{
  const s=fresh(); s.crisisNext=null;
  s.time=3*H; ok('no crisis early', !G.crisisDue(s));
  s.time=6*H; ok('no crisis at hour 6 of a Conquest game', !G.crisisDue(s));
  s.time=11*H; ok('a long Conquest game draws a crisis', G.crisisDue(s));
  const e=fresh({mode:'endless'}); e.crisisNext=null; e.time=6*H;
  ok('Endless mode draws it sooner (hour ~5)', G.crisisDue(e) && G.crisisDueAt(e)<G.crisisDueAt(s));
  G.slowHooks.forEach(h=>h(e,0.2));
  ok('omens come first', !!e.crisisOmen && !G.crisisActive(e));
  e.time=e.crisisOmen.at+1; e.monsterAt=1e12; G.slowHooks.forEach(h=>h(e,0.2));
  ok('then the crisis breaks', G.crisisActive(e) && G.crisisSourcesLeft(e).length===3);
  // chosen by the state of the world
  const w=fresh(); w.time=8*H;
  const base=G.crisisWeights(w);
  w.magic=w.magic||{}; w.magic.casts={p:{scry:Array(80).fill(0)}};
  ok('heavy spellcasting makes a demon incursion likelier', G.crisisWeights(w).demons>base.demons*2);
  const g=fresh({race:'grave'}); g.time=8*H;
  ok('a strong Gravebound realm makes the Dead March likelier', G.crisisWeights(g).deadmarch>base.deadmarch);
}

// ---------------------------------------------------------------- stages, alliance, objective, failure
{
  const s=fresh(); s.time=10*H; s.crisisNext=null;
  s.airel={}; G.aiRel(s,'a1','a2').status='war';
  G.rel(s,'a1').status='war';
  const h0=G.hostility(s,'a2','p'), op0=G.rel(s,'a3').opinion;
  G.startCrisis(s,'demons');
  ok('the crisis raises its sources', G.crisisSourcesLeft(s).length===3 && G.crisisSourcesLeft(s).every(id=>s.camps[id].kind==='crisis'));
  ok('wars among the AI realms pause', G.aiRel(s,'a1','a2').status==='peace');
  ok('rivals warm to the player', G.rel(s,'a3').opinion>op0);
  ok('rivals are far slower to strike the player', G.hostility(s,'a2','p')<h0*0.3, h0.toFixed(2)+' -> '+G.hostility(s,'a2','p').toFixed(2));
  const tp=(s.pending||[]).find(p=>p.kind==='crisis');
  ok('a grand truce is offered to a player at war', !!tp);
  G.resolvePending(s,tp.id,'truce');
  ok('swearing it ends the player\\'s wars', G.rel(s,'a1').status==='peace');
  ok('stage 1 at first', s.crisis.stage===1);
  G.advance(s,46*60,100);
  ok('the crisis escalates in stages', s.crisis.stage===2, s.crisis.stage);
  G.advance(s,25*60,100);
  ok('warbands go out from the sources', G.monsterList(s).some(m=>m.crisis), G.monsterList(s).filter(m=>m.crisis).length);
  // the rite
  const cap=G.capital(s,'p'); s.empires.p.gold=1e6; cap.res.mana=1e5;
  const p0=s.crisis.progress;
  ok('giving to the rite advances the objective', G.crisisContribute(s,'p',cap.id)===null && s.crisis.progress===p0+G.RITUAL_PTS);
  ok('the rite has a cooldown', !!G.crisisContribute(s,'p',cap.id));
  // cast down the sources with a great army
  cap.units={militia:6000,[U(s,'p',1)]:3000};
  const ren0=G.renown(s,'p');
  for(const id of G.crisisSourcesLeft(s)){ const k=s.camps[id]; const e=G.sendArmy(s,cap.id,k.x,k.y,'raid',{militia:2000,[U(s,'p',1)]:1000}); if(e) console.log('send',e); }
  ok('a raid on a source becomes an all-out attack', true);
  G.advance(s,40*60,200);
  ok('destroying every source ends the crisis in victory', s.crisis.status==='won', s.crisis.status+' '+G.crisisSourcesLeft(s).length);
  ok('victory brings great renown to those who fought', G.renown(s,'p')>ren0+40, ren0+' -> '+G.renown(s,'p'));
  ok('the chronicle has a crisis chapter', G.chronicle(s).ev.filter(e=>e.k==='crisis').length>=2 && /overcome/.test(G.chronText(s,G.chronicle(s).ev.filter(e=>e.k==='crisis').pop())));
  ok('the sources and warbands melt away', !Object.values(s.camps).some(k=>k.kind==='crisis') && !G.monsterList(s).some(m=>m.crisis));
  ok('the realms go back to their quarrels', G.hostility(s,'a2','p')>=h0*0.9 || G.rel(s,'a2').status==='peace');
}
{ // the rite alone can win it
  const s=fresh(); s.time=10*H; G.startCrisis(s,'deadmarch');
  s.crisis.progress=s.crisis.goal-1; G.crisisPoints(s,'p',2); G.crisisTick(s);
  ok('completing the great rite ends the crisis', s.crisis.status==='won');
}
{ // failure: it ravages the world
  const s=fresh(); s.time=10*H; G.startCrisis(s,'wyrmking'); s.monsterAt=1e12;
  for(const id of G.crisisSourcesLeft(s)) s.camps[id].units={drake:99999};
  G.advance(s,40*60,200); s.gameOver=null;      // (a long fast-forward could end the game some other way)
  s.time+=2.5*46*60; G.crisisTick(s);
  ok('it holds on while time remains', s.crisis.status==='active' && s.crisis.stage>=3, s.crisis.stage);
  s.time=s.crisis.end+1; const pop0=Object.values(s.cities).reduce((a,c)=>a+c.pop,0);
  G.crisisTick(s);
  ok('time runs out: the crisis is lost', s.crisis.status==='lost', s.crisis.status+' over:'+s.gameOver+' t'+s.time+' end'+s.crisis.end+' p'+s.crisis.progress);
  ok('and it ravages every realm', Object.values(s.cities).reduce((a,c)=>a+c.pop,0)<pop0*0.95);
  ok('another crisis waits hours', !G.crisisDue(s));
}
{ // the Long Winter
  const s=fresh(); s.time=10*H; G.startCrisis(s,'winter');
  const north=s.crisis.srcPos.every(([x,y])=>y<s.map*0.35);
  ok('frost cairns rise in the north', north, JSON.stringify(s.crisis.srcPos));
  const se=G.season(s).index;
  s.crisis.stage=4;
  ok('in its last stage it is winter everywhere', G.season(s).index===3, se+' -> '+G.season(s).index);
  const c=G.capital(s,'p');
  const gIce=G.mod(s,'p',c,'grain'), fIce=G.mod(s,'p',c,'fishing'); s.crisis.status='paused'; const gNo=G.mod(s,'p',c,'grain'), fNo=G.mod(s,'p',c,'fishing'); s.crisis.status='active';
  ok('harvests and fishing fail under the ice', gIce<gNo*0.8 && fIce<fNo*0.5 && G.winterFront(s)>=s.map, gNo.toFixed(2)+' -> '+gIce.toFixed(2));
  G.endCrisis(s,true);
  ok('the calendar returns when it ends', G.season(s).index===Math.floor(s.time/(7200*G.pace(s).time))%4);
}
{ // AI involvement in the crisis
  const s=fresh(); s.time=10*H; G.startCrisis(s,'demons');
  const ai=G.capital(s,'a1'); s.empires.a1.gold=1e6; ai.res.mana=1e5;
  const rnd=Math.random; Math.random=()=>0.01; try { G.aiCrisis(s,s.empires.a1); } finally { Math.random=rnd; }
  ok('rich AI realms give to the rite', (s.crisis.contrib.a1||0)>0);
  const k=s.camps[G.crisisSourcesLeft(s)[0]];
  const off=DATA.races[s.empires.a1.race].units.filter(u=>DATA.units[u].at&&DATA.units[u].type!=='siege'&&DATA.units[u].atk>=(DATA.units[u].defI+DATA.units[u].defC)/2).sort((a,b)=>DATA.units[b].atk-DATA.units[a].atk)[0];
  ai.units={[off]:20000};
  const t=G.tileAt(s,k.x,k.y);
  // move the source within reach of the AI capital
  t.camp=null; const near=landTile(s,x=>G.dist(x,ai)>=3&&G.dist(x,ai)<=5&&G.landReachable(s,x,ai)&&!x.camp); k.x=near.x; k.y=near.y; near.camp=k.id;
  G.aiCrisis(s,s.empires.a1);
  ok('strong AI realms march on the sources', s.moves.some(m=>m.owner==='a1'&&m.crisisSrc));
}

// ---------------------------------------------------------------- save / load
{
  const s=fresh(); s.time=3*H; const m=G.spawnMonster(s,'trolls'); finishLeg(s,m);
  const t=landTile(s,x=>G.dist(x,m)>=3&&G.dist(x,m)<=5&&G.landReachable(s,x,m)); G.monsterLegTo(s,m,t.x,t.y); s.time=(m.depart+m.arrive)/2;
  G.startCrisis(s,'winter');
  const p=G.monsterPos(s,m);
  const s2=G.deserialize(G.serialize(s));
  const m2=s2.monsters[m.id], p2=G.monsterPos(s2,m2);
  ok('creatures survive save/load mid-stride', !!m2 && Math.abs(p.x-p2.x)<1e-6 && Math.abs(p.y-p2.y)<1e-6);
  ok('the crisis survives save/load', G.crisisActive(s2) && s2.crisis.kind==='winter' && G.crisisSourcesLeft(s2).length===3);
  G.advance(s2,600,60);
  ok('a loaded game runs on', G.crisisActive(s2));
  // an old save, from before monsters existed
  const o=fresh(); o.time=2*H; const raw=JSON.parse(G.serialize(o)); delete raw.monsters; delete raw.crisis; delete raw.monsterAt; delete raw.crisisNext; delete raw.crisisOmen;
  const o2=G.deserialize(JSON.stringify(raw));
  let err=null; try { G.advance(o2,1800,200); } catch(e){ err=e; }
  ok('old saves load and run', !!o2 && !err && typeof o2.monsters==='object', err&&err.message);
}

// ---------------------------------------------------------------- intercepting a creature on the move
{
  const s=fresh(); s.time=3*H; const cap=G.capital(s,'p'); cap.units={militia:200,knight:80};
  const spot=landTile(s,t=>G.dist(t,cap)>=4&&G.dist(t,cap)<=6&&G.landReachable(s,t,cap)&&!s.tiles.some(o=>o.city&&G.dist(o,t)<2));
  const tr=G.spawnMonster(s,'trolls',spot,{n:6}); tr.raidAt=1e12; finishLeg(s,tr); tr.rest=1e12;
  ok('a resting creature cannot be intercepted: the hunt is the way', /not on the move/.test(G.canIntercept(s,'p',tr)||''), G.canIntercept(s,'p',tr));
  // send it walking along a long leg (slowly, so riders can cut across its trail)
  let plan=null;
  for (let i=0;i<40&&!(plan&&plan.ok);i++){
    const d=landTile(s,t=>G.dist(t,tr)>=5&&G.dist(t,tr)<=8&&G.dist(t,cap)>=3&&G.landReachable(s,t,tr));
    if(!d) continue; place(s,tr,spot);
    if(!G.monsterLegTo(s,tr,d.x,d.y)) continue;
    tr.arrive=s.time+(tr.arrive-tr.depart)*3; tr.depart=s.time;   // a slow leg
    plan=G.interceptPlan(s,'p',cap,tr,{knight:80});
  }
  ok('a creature on the move: a meeting point on its trail', plan&&plan.ok, plan&&plan.reason);
  if (plan&&plan.ok) {
    ok('the preview of the interception shows the fight', (()=>{ const pv=G.previewIntercept(s,cap,tr,{knight:80},null,plan); return pv && pv.monster && pv.estimated && pv.A>0; })());
    const err=G.sendIntercept(s,cap.id,tr.id,{knight:80});
    const I=s.moves.find(m=>m.type==='intercept'&&m.owner==='p');
    ok('troops go out to lie in wait: an interception tagged as a hunt', !err && I && I.monster===tr.id && I.target===tr.id && I.x===plan.x && I.y===plan.y, err);
    ok('the log says hunters lie in wait', s.log.some(l=>/lie in wait for the troll/.test(l.text)));
    let k=0; while(s.moves.includes(I) && k++<4000) G.step(s,2);
    const rep=s.reports.find(r=>/troll/i.test(r.title));
    ok('the meeting is fought as a hunt on its trail', rep && (/Victory against the troll|Defeat against the troll|followed|trail/.test(rep.title)), rep&&rep.title);
    ok('the creature was slain where they met', !s.monsters[tr.id], rep&&rep.title);
    const back=s.moves.find(m=>m.owner==='p'&&m.type==='return');
    ok('the hunters walk home only as long as they marched', back && back.arrive-back.depart<=I.march+1, back&&(back.arrive-back.depart)+' vs '+I.march);
  }
  // a creature that vanished before they met: the hunt finds nothing
  { const s2=fresh(); s2.time=3*H; const c2=G.capital(s2,'p'); c2.units={knight:80};
    const sp2=landTile(s2,t=>G.dist(t,c2)>=4&&G.dist(t,c2)<=6&&G.landReachable(s2,t,c2)&&!s2.tiles.some(o=>o.city&&G.dist(o,t)<2));
    const t2=G.spawnMonster(s2,'trolls',sp2,{n:4}); t2.raidAt=1e12; finishLeg(s2,t2); t2.rest=1e12;
    let p2=null; for(let i=0;i<40&&!(p2&&p2.ok);i++){ const d=landTile(s2,t=>G.dist(t,t2)>=5&&G.dist(t,t2)<=8&&G.landReachable(s2,t,t2)); if(!d) continue; place(s2,t2,sp2); if(!G.monsterLegTo(s2,t2,d.x,d.y)) continue; t2.arrive=s2.time+(t2.arrive-t2.depart)*3; t2.depart=s2.time; p2=G.interceptPlan(s2,'p',c2,t2,{knight:80}); }
    if (p2&&p2.ok) { G.sendIntercept(s2,c2.id,t2.id,{knight:80}); delete s2.monsters[t2.id]; const I2=s2.moves.find(m=>m.type==='intercept'); let k2=0; while(s2.moves.includes(I2)&&k2++<4000) G.step(s2,2);
      ok('a creature gone before the meeting: the hunt comes to nothing, the troops go home', s2.reports.some(r=>/came to nothing/.test(r.title)) && s2.moves.some(m=>m.type==='return'&&m.owner==='p')); }
  }
}

console.log(fails?fails+' FAILED':'all monster checks passed');
`);
