// Field battles: clickable columns, interception, meeting points, rout, delay, caravans, re-targeting, AI, saves, size bands.
// node tests/intercept.js
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/roads.js','js/quarters.js','js/intercept.js','js/warplan.js','js/automation.js','js/dynasty.js','js/portraits.js','js/portrait-people.js','js/portrait-gear.js'].filter(f=>fs.existsSync(f));
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
let fails=0;
const ok=(name,cond,extra)=>{ if(!cond) fails++; console.log((cond?'PASS ':'FAIL ')+name+(extra!==undefined?' '+extra:'')); };
const quiet=s=>{ s.settings.hostility=0; s.calamityAt=1e12; s.eventAt=1e12; G.aiPressure=()=>0; for(const k of Object.keys(s.camps)){ G.tileAt(s,s.camps[k].x,s.camps[k].y).camp=null; delete s.camps[k]; } s.campTarget=0; s.routes=[]; if(s.monsters) for(const k of Object.keys(s.monsters)) delete s.monsters[k]; };
const fresh=(race='hearth')=>{ const s=G.newGame({name:'T',race}); quiet(s); return s; };
const sum=o=>Object.values(o||{}).reduce((a,b)=>a+b,0);
const war=(s,id)=>{ G.rel(s,id).status='war'; };
// a straight column of the AI marching from (fx,fy) toward a city: it starts far away so the player has time
const setup=(opt={})=>{
  const s=fresh(); const c=G.capital(s,'p');
  const enemy=Object.values(s.cities).filter(x=>x.owner!=='p'&&G.landReachable(s,c,x)).sort((a,b)=>G.dist(b,c)-G.dist(a,c))[0];
  war(s,enemy.owner);
  const race=s.empires[enemy.owner].race, u0=DATA.races[race].units[0];
  enemy.units[u0]=(enemy.units[u0]||0)+(opt.n||60);
  for(const x of Object.values(s.cities)) x.res.grain=1e5;
  const err=G.sendArmy(s,enemy.id,c.x,c.y,opt.type||'attack',{[u0]:opt.n||60});
  const T=s.moves.find(m=>m.owner===enemy.owner&&m.type===(opt.type||'attack'));
  return {s,c,enemy,T,u0,err};
};
const runUntil=(s,pred,max=4000,dt=2)=>{ let k=0; while(!pred()&&k++<max) G.step(s,dt); return pred(); };

// ---- meeting-point math ----
{ const {s,c,T,enemy,err}=setup();
  ok('the enemy column is on the road', !err && T, err);
  c.units.knight=40;
  const plan=G.interceptPlan(s,'p',c,T,{knight:40});
  ok('fast riders find a meeting point on the road', plan.ok, plan.reason);
  if(plan.ok){
    const tl=G.columnTimeline(T); const v=tl.find(x=>Math.round(x.x)===plan.x&&Math.round(x.y)===plan.y);
    ok('the meeting point lies on the target\\'s remaining road, before it arrives', v && plan.at<T.arrive && plan.at>s.time);
    ok('the interceptor gets there no later than the target', s.time+plan.dur<=plan.at+1, (s.time+plan.dur)+' <= '+plan.at);
    ok('the plan names the place and its terrain', /^the (Ford|Woods|Heights|Pass|Fields|Plain|Waters|Field)/.test(plan.name) && DATA.terrain[plan.terrain], plan.name);
    // it is the earliest such point: every earlier vertex is out of reach in time
    const earlier=tl.filter(x=>!x.last && x.t>s.time+2 && x.i<plan.vertex && !G.tileAt(s,Math.round(x.x),Math.round(x.y)).city);
    ok('it is the earliest point they can reach in time', earlier.every(x=>{ const pl=G.planMarch(s,'p',c,G.tileAt(s,Math.round(x.x),Math.round(x.y)),{knight:40}); return !pl.ok || s.time+Math.max(15,pl.dur)>x.t; }), earlier.length);
  }
  // too slow: the column is nearly at its goal, and our troops are far away
  const s2=setup().s; const T2=s2.moves.find(m=>m.owner!=='p'&&m.type==='attack'); const c2=G.capital(s2,'p');
  s2.time=Math.round(T2.depart+0.8*(T2.arrive-T2.depart));
  // a slow city far from their road, on the other side of our capital
  const far=G.foundCity(s2,'p',...(()=>{ const t=G.freeTile(s2,x=>G.dist(x,c2)>=5&&G.dist(x,c2)<=9&&G.dist(x,T2)>G.dist(c2,T2)+4&&G.landReachable(s2,c2,x)&&!x.city); return [t.x,t.y]; })(),'Farholt');
  far.units.pikeman=30;
  const p2=G.interceptPlan(s2,'p',far,T2,{pikeman:30});
  ok('too slow: no meeting point, and the reason says so', !p2.ok && /too slow — they reach .+ first/i.test(p2.reason), p2.reason+' far='+G.dist(far,c2).toFixed(1));
  ok('the reason names their goal', !p2.ok && p2.reason.includes(c2.name), p2.reason);
  s2.time=T2.arrive-5;
  ok('a column at the gates: too slow as well', /too slow|already/i.test(G.interceptPlan(s2,'p',c2,T2,{pikeman:30}).reason||''));
  ok('sending a too-slow interception is refused', G.sendIntercept(s2,far.id,T2.id,{pikeman:30})===p2.reason);
}

// ---- the field battle: terrain, no walls, rout home ----
{ const {s,c,T,enemy,u0}=setup({n:40});
  c.buildings.wall=10;
  // a fair fight: enough militia to win, not so many that nobody is left to flee
  let n=30; for(;n<400;n+=5){ c.units.militia=n; const pv=G.previewIntercept(s,c,T,{militia:n}); if(pv&&pv.win&&pv.A>pv.D*1.35&&pv.defLoss<0.85) break; }
  c.units.militia=n;
  const err=G.sendIntercept(s,c.id,T.id,{militia:n});
  ok('the interception is sent', err===null, err);
  const I=s.moves.find(m=>m.type==='intercept');
  ok('an intercept move carries its target', I && I.target===T.id && I.arrive<T.arrive && (c.units.militia||0)===0);
  const r0=s.reports.length;
  runUntil(s,()=>!s.moves.includes(I));
  const rep=s.reports.find(r=>r.body&&r.body.field);
  ok('a field battle is fought and reported', !!rep, s.reports.slice(0,3).map(r=>r.title).join(' | '));
  if(rep){
    ok('the report names the battle by the ground and nearest place', /^⚔️ Battle at the (Ford|Woods|Heights|Pass|Fields|Plain|Waters|Field) (of|off|at) /.test(rep.title), rep.title);
    ok('the report shows both sides', rep.body.att===s.empires.p.name && rep.body.def===s.empires[enemy.owner].name && sum(rep.body.attSent)===n && sum(rep.body.defHad)===40);
    const tc=rep.body.tactics;
    ok('the battle used the terrain of the meeting tile', tc && tc.terrain===G.tileAt(s,rep.body.field.x,rep.body.field.y).terrain, tc&&tc.terrain);
    ok('no walls and no fortifications in a field battle', tc && !tc.mods.some(m=>m.kind==='wall'||m.kind==='flat'||/Walls|Fortif/.test(m.label)), tc&&tc.mods.map(m=>m.label).join(','));
    ok('the interceptors won', rep.kind==='win');
  }
  ok('the enemy attack never reached the city', !s.moves.includes(T) && !s.moves.some(m=>m.owner===enemy.owner&&m.type==='attack'));
  const rout=s.moves.find(m=>m.owner===enemy.owner&&m.type==='return');
  ok('the loser\\'s survivors rout home', rout && sum(rout.units)>0 && sum(rout.units)<40 && rout.from===enemy.id, rout&&JSON.stringify(rout.units));
  const back=s.moves.find(m=>m.owner==='p'&&m.type==='return');
  ok('our winners march home', back && back.units.militia>0);
  ok('the victory counts for renown', s.empires.p.wins>=1);
  runUntil(s,()=>!s.moves.includes(back));
  ok('they arrive home', (c.units.militia||0)>0 && (c.units.militia||0)<=n, c.units.militia);
}

// ---- a winning target continues, delayed ----
{ const {s,c,T,enemy}=setup({n:200});
  c.units.militia=20;
  const a0=T.arrive, d0=T.depart;
  ok('a weak interception can still be sent', G.sendIntercept(s,c.id,T.id,{militia:20})===null);
  const I=s.moves.find(m=>m.type==='intercept');
  runUntil(s,()=>!s.moves.includes(I));
  const rep=s.reports.find(r=>r.body&&r.body.field);
  ok('the interceptors lost', rep && rep.kind==='loss', rep&&rep.title);
  ok('the winning column continues its mission', s.moves.includes(T) && T.type==='attack');
  ok('…with its survivors', sum(T.units)<200 && sum(T.units)>0, sum(T.units));
  ok('…delayed a little', T.arrive>a0 && T.arrive-a0<=G.IC.delayMax && T.delayed>0, (T.arrive-a0)+'s');
  ok('our beaten survivors fall back home', s.moves.some(m=>m.owner==='p'&&m.type==='return') || (c.units.militia||0)>0 || sum(rep.body.attLost)===20);
}

// ---- an intercepted caravan loses its cargo ----
{ const s=fresh(); const c=G.capital(s,'p');
  const enemy=Object.values(s.cities).filter(x=>x.owner!=='p'&&G.landReachable(s,c,x)).sort((a,b)=>G.dist(a,c)-G.dist(b,c))[0];
  war(s,enemy.owner);
  const other=G.foundCity(s,enemy.owner,...(()=>{ const t=G.freeTile(s,x=>G.dist(x,enemy)>=6&&G.dist(x,enemy)<=9&&G.landReachable(s,enemy,x)&&!x.city); return [t.x,t.y]; })(),'Marketton');
  enemy.buildings.market=5; enemy.res.grain=5000;
  const err=G.sendArmy(s,enemy.id,other.x,other.y,'trade',{},{grain:600});
  const T=s.moves.find(m=>m.type==='trade'&&m.owner===enemy.owner);
  ok('an enemy caravan sets out', !err && T, err);
  // a city of ours close to its road
  const tl=G.columnTimeline(T); const mid=tl[Math.floor(tl.length/2)];
  const spot=G.freeTile(s,x=>G.dist(x,mid)>=2&&G.dist(x,mid)<=3.5&&!x.city&&G.landReachable(s,x,enemy));
  const mine=G.foundCity(s,'p',spot.x,spot.y,'Ambushford'); mine.units.knight=30; mine.res.grain=1e5;
  const e2=G.sendIntercept(s,mine.id,T.id,{knight:30});
  ok('riders go after the caravan', e2===null, e2);
  const I=s.moves.find(m=>m.type==='intercept');
  runUntil(s,()=>I && !s.moves.includes(I));
  ok('the caravan is gone', !s.moves.includes(T));
  const back=s.moves.find(m=>m.owner==='p'&&m.type==='return');
  ok('its cargo goes home with our riders as loot', back && (back.cargo.grain||0)>0, back&&JSON.stringify(back.cargo));
  ok('nothing is still bound for the caravan\\'s goal', !s.moves.some(m=>m.type==='trade'&&m.x===other.x&&m.y===other.y));
}

// ---- re-targeting ----
{ // the target is held up on the road (it changed pace): at the meeting point it is not there yet, so the riders re-plan once
  const {s,c,T,enemy}=setup({n:40});
  c.units.knight=150;
  G.sendIntercept(s,c.id,T.id,{knight:150});
  const I=s.moves.find(m=>m.type==='intercept');
  T.depart+=90; T.arrive+=90;
  runUntil(s,()=>!s.moves.includes(I));
  const I2=s.moves.find(m=>m.type==='intercept'&&m.owner==='p');
  ok('a target that is not where expected: the interceptor re-targets once', I2 && I2.retargeted===1 && I2.target===T.id && I2.arrive<T.arrive, I2?'':s.reports[0].title);
  if(I2){
    ok('…and its road home covers both legs', I2.homePath.length>=I.path.length && I2.march>I.march);
    T.depart+=90; T.arrive+=90;           // held up again: no second re-target
    runUntil(s,()=>!s.moves.includes(I2));
    ok('…but only once: then it gives up and turns home', !s.moves.some(m=>m.type==='intercept') && s.reports.some(r=>/came to nothing/.test(r.title)) && s.moves.some(m=>m.owner==='p'&&m.type==='return'&&m.units.knight===150));
  }
}
{ // the target ends early: it turns home; the interceptor follows the return march if it can still catch it, or comes home
  const {s,c,T,enemy}=setup({n:40});
  c.units.knight=150;
  G.sendIntercept(s,c.id,T.id,{knight:150});
  const I=s.moves.find(m=>m.type==='intercept');
  runUntil(s,()=>s.time>=T.depart+0.75*(I.arrive-T.depart));
  const rec=G.recallMove(s,T.id,enemy.owner);
  ok('the enemy column turns back (G.recallMove)', rec===null, rec);
  const R=s.moves.find(m=>m.owner===enemy.owner&&m.type==='return');
  ok('…as a return march that remembers where it came from', R && R.via===T.id);
  // make the way home long enough to be caught
  R.arrive+=600;
  runUntil(s,()=>!s.moves.includes(I));
  const I2=s.moves.find(m=>m.type==='intercept'&&m.owner==='p');
  ok('the interceptor re-targets onto the returning column', I2 && I2.retargeted===1 && I2.target===R.id, I2?'':s.reports[0].title);
  if(I2){ runUntil(s,()=>!s.moves.includes(I2)); ok('…and catches it', s.reports.some(r=>r.body&&r.body.field)); }
}
{ // a target that is gone with no successor: the interceptor comes home
  const z=setup({n:40}); z.c.units.knight=50; G.sendIntercept(z.s,z.c.id,z.T.id,{knight:50});
  z.s.moves.splice(z.s.moves.indexOf(z.T),1);
  const I3=z.s.moves.find(m=>m.type==='intercept');
  runUntil(z.s,()=>!z.s.moves.includes(I3));
  ok('a vanished target: the interceptors turn home', z.s.moves.some(m=>m.owner==='p'&&m.type==='return'&&m.units.knight===50) && z.s.reports.some(r=>/came to nothing/.test(r.title)));
}

// ---- recall of one's own columns ----
{ const s=fresh(); const c=G.capital(s,'p'); c.units.militia=30;
  const t=G.freeTile(s,x=>G.dist(x,c)>=6&&G.dist(x,c)<=8&&G.landReachable(s,c,x)&&!x.city);
  G.sendArmy(s,c.id,t.x,t.y,'settle',{settlers:0,militia:30}); // invalid (no settlers): use reinforce to another city instead
  const b=G.foundCity(s,'p',t.x,t.y,'Farhold');
  ok('reinforce sent', G.sendArmy(s,c.id,b.x,b.y,'reinforce',{militia:30})===null);
  const m=s.moves.find(x=>x.type==='reinforce');
  G.advance(s,(m.arrive-m.depart)/2,50);
  ok('recall turns our own column back', G.recallMove(s,m.id)===null && !s.moves.includes(m));
  const r=s.moves.find(x=>x.type==='return');
  ok('…the way back takes as long as they marched', r && Math.abs((r.arrive-r.depart)-(s.time-m.depart))<=6, r&&(r.arrive-r.depart));
  runUntil(s,()=>!s.moves.length);
  ok('…and they are home', c.units.militia===30 && !(b.units.militia>0));
  ok('a return march cannot be recalled', (()=>{ c.units.militia=5; G.sendArmy(s,c.id,b.x,b.y,'reinforce',{militia:5}); const x=s.moves[0]; G.recallMove(s,x.id); return G.recallMove(s,s.moves[0].id)==='Already heading home'; })());
}

// ---- not allowed against allies or own moves ----
{ const {s,c,T,enemy}=setup();
  c.units.knight=40;
  const own=(()=>{ c.units.militia=10; const t=G.freeTile(s,x=>G.dist(x,c)>=5&&G.dist(x,c)<=7&&G.landReachable(s,c,x)&&!x.city); G.sendArmy(s,c.id,t.x,t.y,'scout',{}); c.units.scout=2; G.sendArmy(s,c.id,t.x,t.y,'scout',{scout:2}); return s.moves.find(m=>m.owner==='p'); })();
  ok('never against our own columns', own && /own column/.test(G.canIntercept(s,'p',own)) && G.sendIntercept(s,c.id,own.id,{knight:40})!==null);
  G.rel(s,enemy.owner).status='alliance';
  ok('never against allies', /allies/.test(G.canIntercept(s,'p',T)||'') && /allies/.test(G.sendIntercept(s,c.id,T.id,{knight:40})||''));
  G.rel(s,enemy.owner).status='peace'; G.signTreaty(s,'defense','p',enemy.owner,{quiet:true});
  ok('never against a defensive-pact partner', /pact/.test(G.canIntercept(s,'p',T)||''), G.canIntercept(s,'p',T));
  // AI realms may only intercept enemies they are at war with
  const ais=Object.keys(s.empires).filter(id=>id!=='p'&&id!==enemy.owner);
  if(ais.length){ G.aiRel(s,ais[0],enemy.owner).status='peace'; ok('an AI at peace may not intercept', G.canIntercept(s,ais[0],T)==='Not at war'); }
}

// ---- the AI intercepts an attack on its city ----
{ const s=fresh(); const c=G.capital(s,'p');
  const enemy=Object.values(s.cities).filter(x=>x.owner!=='p'&&G.landReachable(s,c,x)).sort((a,b)=>G.dist(a,c)-G.dist(b,c))[0];
  war(s,enemy.owner);
  for(const x of Object.values(s.cities)) x.res.grain=1e5;
  c.units.militia=30;
  ok('our raid sets out', G.sendArmy(s,c.id,enemy.x,enemy.y,'raid',{militia:30})===null);
  const T=s.moves.find(m=>m.owner==='p');
  const race=s.empires[enemy.owner].race; const strong=DATA.races[race].units[4];
  enemy.units[strong]=(enemy.units[strong]||0)+120;
  const emp=s.empires[enemy.owner];
  const got=G.aiIntercept(s,emp);
  const I=s.moves.find(m=>m.type==='intercept'&&m.owner===enemy.owner);
  ok('the AI sends an interception against a column marching on its city', got===T.id && I && I.target===T.id, got);
  ok('…keeping a share of its troops at home', (enemy.units[strong]||0)>0);
  ok('the AI does not intercept the same column twice', G.aiIntercept(s,emp)===null);
  // it ticks on its own through the hooks (every few game minutes)
  const s2=fresh(); const c2=G.capital(s2,'p'); const e2=Object.values(s2.cities).filter(x=>x.owner!=='p'&&G.landReachable(s2,c2,x)).sort((a,b)=>G.dist(a,c2)-G.dist(b,c2))[0];
  war(s2,e2.owner); c2.units.militia=20; for(const x of Object.values(s2.cities)) x.res.grain=1e5;
  G.sendArmy(s2,c2.id,e2.x,e2.y,'raid',{militia:20});
  const st=DATA.races[s2.empires[e2.owner].race].units[4]; e2.units[st]=(e2.units[st]||0)+150;
  runUntil(s2,()=>s2.moves.some(m=>m.type==='intercept'),400,5);
  ok('the AI hook launches it in play', s2.moves.some(m=>m.type==='intercept'&&m.owner===e2.owner) || s2.reports.some(r=>r.body&&r.body.field));
}

// ---- foreign size is banded ----
{ const {s,c,T}=setup({n:120});
  const vis=G.visibleSet(s);
  const own=G.columnIntel(s,T.owner,T);
  ok('own columns are known exactly', own.exact && own.approx===120);
  const far=G.columnIntel(s,'p',T);
  ok('a foreign column\\'s size is banded, not exact', !far.exact && far.lo<=120 && far.hi>=120 && far.hi>far.lo && /small band|warband|large host|great army|vast horde/.test(far.word), far.word+' ~'+far.approx+' ('+far.lo+'–'+far.hi+')');
  // closer watch narrows the band
  s.time=T.arrive-30; const near=G.columnIntel(s,'p',T);
  ok('a close watch narrows the band', near.level==='close' && (near.hi-near.lo)<(far.hi-far.lo), near.level+' '+near.lo+'–'+near.hi);
  ok('a hostile column marching on our city shows its mission', near.mission==='assault');
}

// ---- naval: ships meet ships at sea; land troops cannot ----
{ const {s,c,T}=setup({n:40});
  c.units.warship=2;
  ok('ships cannot fight a column on land', /land/.test(G.interceptPlan(s,'p',c,T,{warship:2}).reason||''));
  // a fleet crossing open water past a coastal city of ours
  const W=s.tiles.filter(t=>G.isWater(t));
  let done=false;
  for(let tries=0; tries<60 && !done && W.length; tries++){
    const shore=s.tiles.filter(t=>!G.isWater(t)&&!t.city&&!t.minor&&!(DATA.terrain[t.terrain]||{}).impassable&&G.coastal(s,t.x,t.y));
    const a=shore[(tries*7919)%shore.length], b=shore.filter(t=>G.dist(t,a)>=8).find(t=>G.path(s,a,t,true));
    if(!a||!b) continue;
    const sea=G.path(s,a,b,true); if(!sea||sea.path.length<8) continue;
    const midW=sea.path.slice(2,-2).map(([x,y])=>G.tileAt(s,x,y)).filter(t=>G.isWater(t));
    if(!midW.length) continue;
    const port=shore.find(t=>G.dist(t,midW[0])<=3&&G.dist(t,a)>=2&&G.dist(t,b)>=2&&s.tiles.every(o=>!o.city||G.dist(o,t)>=1.5));
    if(!port) continue;
    const pc=G.foundCity(s,'p',port.x,port.y,'Gullhaven'); pc.units.warship=6; pc.units.militia=10; pc.res.grain=1e5;
    const foe=Object.keys(s.empires).find(x=>x!=='p'); war(s,foe);
    const N={ id:G.newId(s,'m'), owner:foe, type:'raid', from:Object.values(s.cities).find(x=>x.owner===foe).id, fx:a.x,fy:a.y,x:b.x,y:b.y, path:sea.path, naval:true, units:{warship:2,transport:1}, cargo:{}, depart:s.time, arrive:s.time+Math.round(sea.len*60) };
    s.moves.push(N);
    ok('land troops cannot meet a fleet at sea', /sea/.test(G.interceptPlan(s,'p',pc,N,{militia:10}).reason||''));
    const pl=G.interceptPlan(s,'p',pc,N,{warship:6});
    if(!pl.ok) { s.moves.splice(s.moves.indexOf(N),1); continue; }
    ok('war galleys find a meeting point at sea', pl.ok && pl.naval && G.isWater(G.tileAt(s,pl.x,pl.y)), pl.reason);
    ok('the galleys sail out', G.sendIntercept(s,pc.id,N.id,{warship:6})===null);
    const I=s.moves.find(m=>m.type==='intercept'&&m.target===N.id);
    runUntil(s,()=>!s.moves.includes(I));
    const rep=s.reports.find(r=>r.body&&r.body.field);
    ok('a sea battle is fought where they meet', rep && rep.body.tactics && rep.body.tactics.terrain==='lake' && /Waters/.test(rep.title), rep&&rep.title);
    done=true;
  }
  if(!done) console.log('SKIP naval interception: no suitable sea on this map');
}

// ---- war magi ride with interceptions and fight in the field ----
{ const {s,c,enemy,T}=setup({n:60});
  const hireAt=(owner,city,opts)=>{ city.buildings.magetower=10; s.empires[owner].gold=50000; city.res.mana=8000; const R=s.magi.realms[owner]; if(R) R.pool=null;
    const pool=G.magiPool(s,owner); const i=pool.list.findIndex(x=>x.city===city.id); Object.assign(pool.list[i],opts); const e=G.recruitMagus(s,owner,i); if(e) throw new Error(e);
    const l=G.magiOf(s,owner), g=l[l.length-1]; G.stationMagus(s,owner,g.id,'war',city.id); return g; };
  const g=hireAt('p',c,{rank:4,school:G.schoolsOf(s,'p')[0],traits:['devoted']});
  c.units.knight=60;
  const plan=G.interceptPlan(s,'p',c,T,{knight:60});
  ok('(magi) the riders can meet the column', plan.ok, plan.reason);
  const pv=plan.ok?G.previewIntercept(s,c,T,{knight:60},null,plan):null;
  ok('the interception preview shows the battle magic expected', pv && /Battle magic: your/.test(pv.magic||'') && g.status==='home', pv&&pv.magic);
  const err=G.sendIntercept(s,c.id,T.id,{knight:60});
  const I=s.moves.find(m=>m.type==='intercept'&&m.owner==='p');
  ok('a war magus rides with an interception', !err && I && I.magi && I.magi.includes(g.id) && g.status==='marching' && g.move===I.id, err);
  G.MAGI.rng=()=>0.99;
  try { runUntil(s,()=>!s.moves.includes(I)); } finally { G.MAGI.rng=null; }
  const rep=s.reports.find(r=>r.body&&r.body.field);
  ok('the field battle carries the magic: a labelled modifier and the report line', rep && (rep.body.tactics.mods||[]).some(x=>x.kind==='magic'&&x.label.includes(g.name)) && rep.body.extra.includes(g.name) && rep.body.magi && rep.body.magi.att.some(x=>x.name===g.name), rep&&rep.body.extra);
  ok('the magus gained experience and rides home with the survivors', g.battles===1 && (g.status==='marching' ? s.moves.some(m=>m.id===g.move&&m.type==='return'&&m.magi&&m.magi.includes(g.id)) : g.status==='home'), g.status+' '+g.move);
}
{ // the column's own magi defend it: a duel of magi in the field
  const s=fresh(); const c=G.capital(s,'p');
  const enemy=Object.values(s.cities).filter(x=>x.owner!=='p'&&G.landReachable(s,c,x)).sort((a,b)=>G.dist(b,c)-G.dist(a,c))[0];
  war(s,enemy.owner); for(const x of Object.values(s.cities)) x.res.grain=1e5;
  const hireAt=(owner,city,opts)=>{ city.buildings.magetower=10; s.empires[owner].gold=50000; city.res.mana=8000; const R=s.magi.realms[owner]; if(R) R.pool=null;
    const pool=G.magiPool(s,owner); const i=pool.list.findIndex(x=>x.city===city.id); Object.assign(pool.list[i],opts); const e=G.recruitMagus(s,owner,i); if(e) throw new Error(e);
    const l=G.magiOf(s,owner), g=l[l.length-1]; G.stationMagus(s,owner,g.id,'war',city.id); return g; };
  const d=hireAt(enemy.owner,enemy,{rank:2,traits:['devoted']});
  const u0=DATA.races[s.empires[enemy.owner].race].units[0]; enemy.units[u0]=(enemy.units[u0]||0)+60;
  G.sendArmy(s,enemy.id,c.x,c.y,'attack',{[u0]:60});
  const T=s.moves.find(m=>m.owner===enemy.owner&&m.type==='attack');
  ok('the enemy magus rides with the column', T && T.magi && T.magi.includes(d.id));
  const g=hireAt('p',c,{rank:5,traits:['devoted','battlehardened']}); c.units.knight=60;
  const err=G.sendIntercept(s,c.id,T.id,{knight:60});
  const I=s.moves.find(m=>m.type==='intercept'&&m.owner==='p');
  G.MAGI.rng=()=>0.99;
  try { runUntil(s,()=>!s.moves.includes(I)); } finally { G.MAGI.rng=null; }
  const rep=s.reports.find(r=>r.body&&r.body.field);
  ok('the magi riding with the column defend it: a duel in the field', !err && rep && rep.body.magi && rep.body.magi.duel && rep.body.magi.duel.def===d.name && /Duel/.test(rep.body.extra), err||(rep&&rep.body.extra));
}

// ---- a caravan of ours intercepted by a rival: a clear report ----
{ const s=fresh(); const c=G.capital(s,'p'); c.buildings.market=5; c.res.grain=5000; c.res.timber=5000;
  const enemy=Object.values(s.cities).filter(x=>x.owner!=='p'&&G.landReachable(s,c,x)).sort((a,b)=>G.dist(b,c)-G.dist(a,c))[0];
  const dest=Object.values(s.cities).filter(x=>x.owner!=='p'&&x.owner!==enemy.owner&&G.landReachable(s,c,x)).sort((a,b)=>G.dist(b,c)-G.dist(a,c))[0] || enemy;
  war(s,enemy.owner);
  const e=G.sendArmy(s,c.id,dest.x,dest.y,'trade',{},{grain:300,timber:200});
  const K=s.moves.find(m=>m.owner==='p'&&m.type==='trade');
  ok('our caravan is on the road', !e && K, e);
  const race=s.empires[enemy.owner].race; let sent=null;
  for (const u of DATA.races[race].units) { const d=DATA.units[u]; if(!d||d.type==='ship'||d.type==='civ'||d.type==='siege') continue; enemy.units[u]=(enemy.units[u]||0)+80; if(!G.sendIntercept(s,enemy.id,K.id,{[u]:80})) { sent=u; break; } }
  if (!sent) { // too slow from their capital: meet it from a city they found beside our road
    const tl=G.columnTimeline(K), v=tl[Math.floor(tl.length/2)]; const t=G.freeTile(s,x=>!G.isWater(x)&&G.dist(x,v)>=2&&G.dist(x,v)<=3&&G.landReachable(s,x,c));
    const nc=G.foundCity(s,enemy.owner,t.x,t.y,'Ambushford'); const u=DATA.races[race].units[0]; nc.units[u]=80; if(!G.sendIntercept(s,nc.id,K.id,{[u]:80})) sent=u; }
  ok('a rival sends troops to take our caravan', !!sent);
  const I=s.moves.find(m=>m.type==='intercept'&&m.owner===enemy.owner);
  runUntil(s,()=>!s.moves.includes(I));
  const rep=s.reports.find(r=>r.body&&r.body.caravan);
  const nm=s.empires[enemy.owner].name;
  ok('the report says where it was bound, who took it, where, and that the cargo was lost', rep && rep.title.includes('Your caravan to '+dest.name+' was intercepted by the '+nm) && /(near|at) /.test(rep.title) && /cargo lost/.test(rep.title) && rep.kind==='loss', rep&&rep.title);
  ok('the report lists the cargo lost', rep && /grain/.test(rep.body.extra) && /timber/.test(rep.body.extra) && rep.body.caravan.lost.grain===300, rep&&rep.body.extra);
  ok('the log says it too', s.log.some(l=>l.text.includes('Your caravan to '+dest.name+' was intercepted')));
  ok('the caravan is gone from the road', !s.moves.includes(K));
}

// ---- saves ----
{ const {s,c,T}=setup({n:40}); c.units.knight=100; G.sendIntercept(s,c.id,T.id,{knight:100});
  const s2=G.deserialize(G.serialize(s));
  const I=s2.moves.find(m=>m.type==='intercept');
  ok('save/load keeps an interception on the road', I && I.target===T.id && I.march>0);
  runUntil(s2,()=>!s2.moves.includes(I));
  ok('a loaded interception still fights', s2.reports.some(r=>r.body&&r.body.field));
  const old=JSON.parse(G.serialize(s)); old.moves=old.moves.filter(m=>m.type!=='intercept'); for(const m of old.moves){ delete m.via; delete m.delayed; } for(const e of Object.values(old.empires)) delete e.icClock;
  let err=null, s3=null; try { s3=G.deserialize(JSON.stringify(old)); G.advance(s3,600,120); } catch(e){ err=e; }
  ok('an old save without interceptions loads and runs', s3 && !err, err&&err.stack);
}

console.log(fails?fails+' FAILED':'ALL PASS');
if(fails) process.exitCode=1;
`);
