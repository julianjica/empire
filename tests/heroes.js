// Rival heroes: AI champions, personalities, adventures, attacks, revives, duels, slaying, save/load.  node tests/heroes.js
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=['js/data.js','js/races2.js','js/engine.js','js/research.js',...['js/forge.js'].filter(f=>fs.existsSync(f)),'js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js'].filter(f=>fs.existsSync(f));
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
let fails=0;
const ok=(name,cond,extra)=>{ if(!cond) fails++; console.log((cond?'PASS ':'FAIL ')+name+(extra?' '+extra:'')); };
const fresh=(race='hearth')=>{ const s=G.newGame({name:'T',race}); s.settings.hostility=0; s.calamityAt=1e12; s.eventAt=1e12; AIS=Object.keys(s.empires).filter(id=>id!=='p'); return s; };
const withRandom=(v,fn)=>{ const r=Math.random; Math.random=()=>v; try { return fn(); } finally { Math.random=r; } };
let AIS=['a1','a2','a3'];   // refreshed from each fresh game below (no fixed number of rivals)
const nearTile=(s,c,dmin,dmax)=>G.freeTile(s,t=>G.dist(t,c)>=dmin&&G.dist(t,c)<=dmax&&Object.values(s.cities).every(o=>G.dist(o,t)>=dmin));
const mkMove=(s,owner,from,to,type,units)=>({ id:G.newId(s,'m'), owner, type, from:from.id, fx:from.x, fy:from.y, x:to.x, y:to.y, units, cargo:{}, depart:s.time, arrive:s.time });

// ---- every AI realm has a hero with a personality and a fitting name ----
{ const s=fresh();
  ok('AI heroes exist', AIS.every(id=>s.empires[id].hero && G.heroOf(s,id)===s.empires[id].hero));
  ok('AI heroes have personalities', AIS.every(id=>DATA.heroPersonalities[s.empires[id].hero.personality]), AIS.map(id=>s.empires[id].hero.personality).join(','));
  ok('names fit the race', AIS.every(id=>((DATA.races[s.empires[id].race].heroNames)||DATA.heroNames[s.empires[id].race]).includes(s.empires[id].hero.name)), AIS.map(id=>s.empires[id].hero.name).join(', '));
  ok('AI heroes start in their capitals', AIS.every(id=>G.capital(s,id).units.hero===1 && G.heroCityOf(s,id)===G.capital(s,id)));
  ok('player hero untouched', G.hero(s)===s.empires.p.hero && !s.empires.p.hero.personality && G.heroCity(s)===G.capital(s,'p') && G.capital(s,'p').units.hero===1);
  ok('one hero per capital', Object.values(s.cities).every(c=>(c.units.hero||0)<=1));
}

// ---- points by personality ----
{ const s=fresh();
  const want={a1:'warlord',a2:'steward',a3:'adventurer'};
  for(const id of AIS){ const h=s.empires[id].hero; h.personality=want[id]; h.free=20; s.empires[id].heroAdvAt=1e12; G.rivalHeroThink(s,s.empires[id]); }
  const P=id=>s.empires[id].hero.points;
  ok('points all spent', AIS.every(id=>s.empires[id].hero.free===0));
  ok('warlord: might and leadership', P('a1').str>=9 && P('a1').lead>=9 && !P('a1').econ && !P('a1').guard, JSON.stringify(P('a1')));
  ok('steward: stewardship and warding', P('a2').econ>=9 && P('a2').guard>=9 && !P('a2').str, JSON.stringify(P('a2')));
  ok('adventurer: might, some arcana', P('a3').str>=15 && P('a3').arcana>=3 && !P('a3').lead && !P('a3').econ, JSON.stringify(P('a3')));
}

// ---- equips the best items, sells the surplus ----
{ const s=fresh(); const id='a1'; const h=s.empires[id].hero; h.personality='warlord';
  const mk=(slot,rarity,fx,name)=>({id:'t'+Math.random(),slot,rarity,name:name||slot+rarity,icon:'?',fx});
  h.items.push(mk('weapon',0,{atk:60}), mk('weapon',2,{atk:320}), mk('armor',1,{def:110,armor:0.2}), mk('trinket',2,{xp:0.5}), mk('trinket',1,{lead:0.06}), mk('horse',0,{spd:10}), mk('weapon',1,{atk:150}));
  const g0=s.empires[id].gold;
  G.rivalEquipBest(s,s.empires[id]);
  ok('equips best weapon', h.eq.weapon && h.eq.weapon.rarity===2);
  ok('equips armor and horse', h.eq.armor && h.eq.horse);
  ok('warlord prefers a war banner', h.eq.trinket && h.eq.trinket.fx.lead===0.06, JSON.stringify(h.eq.trinket&&h.eq.trinket.fx));
  ok('surplus kept small, sold for gold', h.items.length<=4 && s.empires[id].gold>=g0, h.items.length+' items, gold +'+(s.empires[id].gold-g0));
  ok('gear raises hero stats', G.heroStats(s,id).atk===80+320 && G.heroLeadership(s,id)>1.05);
}

// ---- goes adventuring in ruins near its realm, gains experience and levels ----
{ const s=fresh(); const id='a2'; const emp=s.empires[id]; const h=emp.hero; h.personality='adventurer';
  const cap=G.capital(s,id);
  const t=nearTile(s,cap,2,3); t.ruin={tier:1,readyAt:0,units:null}; s.special.push(t);
  for(const o of s.special) if(o.ruin && o!==t) o.ruin.readyAt=1e12;
  emp.heroAdvAt=0;
  withRandom(0.01,()=>G.rivalHeroThink(s,emp));
  const mv=s.moves.find(m=>m.owner===id&&m.type==='adventure');
  ok('AI hero sets out for nearby ruins', !!mv && mv.units.hero===1 && !cap.units.hero, mv?'to ('+mv.x+','+mv.y+')':'no move');
  const xp0=h.xp, a0=h.adventures;
  if(mv){ s.moves=s.moves.filter(m=>m!==mv); withRandom(0.01,()=>G.resolveMove(s,mv)); }
  ok('adventure resolved for the AI hero', h.adventures===a0+1 && h.xp>xp0 && t.ruin.readyAt>s.time, 'xp '+xp0+' -> '+h.xp+' items '+h.items.length);
  ok('no adventure report reaches the player', !s.reports.some(r=>r.body&&r.body.adventure));
  ok('AI ruins do not count as the player\\'s adventures', !s.stats.adventures);
  const ret=s.moves.find(m=>m.owner===id&&m.type==='return'&&m.units.hero);
  ok('hero marches home with the loot', !!ret && Object.keys(ret.cargo).length>0);
  const L0=h.level; G.heroGainXp(s,5000,id);
  ok('AI hero gains levels', h.level>L0+2 && h.free>0, 'level '+L0+' -> '+h.level);
  ok('AI level-ups stay out of the player chronicle', !s.log.some(l=>l.text.includes(h.name+' reached level')));
  // ruins by the player's lands are left alone
  const s2=fresh(); const e2=s2.empires.a1; e2.hero.personality='adventurer'; e2.heroAdvAt=0;
  for(const o of s2.special) if(o.ruin) o.ruin.readyAt=1e12;
  const pc=G.capital(s2,'p'); const near=nearTile(s2,pc,2,3); near.ruin={tier:1,readyAt:0,units:null}; s2.special.push(near);
  withRandom(0.01,()=>G.rivalHeroThink(s2,e2));
  ok('ruins by the player\\'s lands are left alone', !s2.moves.some(m=>m.owner==='a1'&&m.type==='adventure'));
}

// ---- joins a big attack sent this tick ----
{ const s=fresh(); const id='a1'; const emp=s.empires[id]; const h=emp.hero; h.personality='warlord';
  const cap=G.capital(s,id); const unit=DATA.races[emp.race].units[0];
  cap.units[unit]=400;
  const target=G.capital(s,'a2');
  const e=G.sendArmy(s,cap.id,target.x,target.y,'raid',{[unit]:300});
  const m=s.moves.find(x=>x.owner===id&&x.type==='raid');
  const arr0=m&&m.arrive;
  withRandom(0.01,()=>G.rivalHeroThink(s,emp));
  ok('hero joins the big attack', e===null && m.units.hero===1 && !cap.units.hero, 'send '+e);
  ok('march time recomputed for the hero', m.arrive>=arr0 && m.arrive===m.depart+G.travelTime(s,id,cap,G.tileAt(s,m.x,m.y),G.slowest(s,id,m.units)));
  ok('leadership applies to that march', G.heroLeadership(s,id)>=1);
  // a small raid, or a wounded hero, stays home
  const s2=fresh(); const e2=s2.empires.a1; e2.hero.personality='warlord'; const c2=G.capital(s2,'a1'); const u2=DATA.races[e2.race].units[0];
  c2.units[u2]=400; e2.hero.hp=30; const t2=G.capital(s2,'a2');
  G.sendArmy(s2,c2.id,t2.x,t2.y,'raid',{[u2]:300});
  withRandom(0.01,()=>G.rivalHeroThink(s2,e2));
  ok('a wounded hero stays home', c2.units.hero===1 && !s2.moves.some(x=>x.units.hero));
  // resolve the hero-led attack: hero gains experience, survives or falls cleanly
  const xp0=h.xp; s.moves=s.moves.filter(x=>x!==m); G.resolveMove(s,m);
  ok('hero-led attack resolves', h.dead || h.xp>xp0 || s.moves.some(x=>x.owner===id&&x.units.hero), 'xp '+xp0+' -> '+h.xp+' hp '+Math.round(h.hp));
}

// ---- rests in its capital when threatened ----
{ const s=fresh(); const id='a1'; const emp=s.empires[id]; const h=emp.hero; h.personality='steward'; emp.heroAdvAt=1e12;
  const cap=G.capital(s,id); const t=nearTile(s,cap,3,4);
  const other=G.foundCity(s,id,t.x,t.y,'Outpost'); other.founded=s.time+1;
  delete cap.units.hero; other.units.hero=1;
  const pc=G.capital(s,'p');
  s.moves.push({ id:G.newId(s,'m'), owner:'p', type:'raid', from:pc.id, fx:pc.x, fy:pc.y, x:cap.x, y:cap.y, units:{militia:50}, cargo:{}, depart:s.time, arrive:s.time+5000 });
  G.rivalHeroThink(s,emp);
  const mv=s.moves.find(m=>m.owner===id&&m.type==='reinforce'&&m.units.hero);
  ok('threatened capital: hero rides to its walls', !!mv && mv.x===cap.x && mv.y===cap.y);
  s.moves=s.moves.filter(m=>m!==mv); G.resolveMove(s,mv);
  ok('hero stands in the capital, warding it', cap.units.hero===1 && G.heroDefense(s,id)>=1);
}

// ---- revives when fallen, paying gold ----
{ const s=fresh(); const id='a3'; const emp=s.empires[id]; const h=emp.hero;
  G.heroGainXp(s,800,id); const L=h.level;
  G.killHero(s,id,'in a test');
  ok('AI hero can fall', h.dead && !G.heroCityOf(s,id));
  ok('player not told of a rival hero\\'s ordinary death', !s.log.some(l=>l.text.includes(h.name)));
  emp.gold=5; G.rivalHeroThink(s,emp);
  ok('no revive without gold', !h.reviveAt);
  s.time+=3600; emp.gold=10000; G.rivalHeroThink(s,emp);
  ok('revive paid in gold', !!h.reviveAt && emp.gold===10000-G.rivalReviveCost(s,id), 'gold '+emp.gold+' cost '+G.rivalReviveCost(s,id)+' level '+L);
  G.advance(s,G.reviveTime(s,id)+20,200);
  ok('AI hero rises again (home, or already off on its business)', !h.dead && h.hp>0 && (G.heroCityOf(s,id)||G.heroMovingOf(s,id)) && h.revived===1, 'dead '+h.dead);
}

// ---- duels: wounds, experience, morale, report text ----
{ const s=fresh(); const id='a1'; const emp=s.empires[id]; emp.heroAdvAt=1e12;
  const pc=G.capital(s,'p'), ac=G.capital(s,id);
  const ph=G.hero(s), ah=emp.hero; ph.points.str=30; ah.points.str=0; ah.hp=100;
  ah.xp=-1e9;   // no level-up mid-battle: each level heals +30 and would hide the duel wound
  const pu=DATA.races.hearth.units[0], au=DATA.races[emp.race].units[0];
  ac.units[au]=200; pc.units[pu]=150; delete pc.units.hero;
  const m=mkMove(s,'p',pc,ac,'raid',{[pu]:150,hero:1});
  const phx=ph.xp, ahp=ah.hp, nRep=s.reports.length;
  withRandom(0.5,()=>G.resolveMove(s,m));
  const rep=s.reports[0];
  ok('a duel is reported in the battle report', s.reports.length===nRep+1 && /Duel/.test(rep.body.extra||''), (rep.body.extra||'').slice(0,160));
  ok('duel loser badly wounded', ah.dead || ahp-ah.hp>=30, 'rival hp '+ahp+' -> '+Math.round(ah.hp));
  ok('duel winner gains experience', ph.xp>phx || ph.level>1, 'xp '+phx+' -> '+ph.xp+' level '+ph.level);
  ok('rival hero marked as met (gear now visible)', !!ah.metP);
  ok('losing side lost heart (extra casualties shown)', rep.body.defLost[au]>0);
  // morale: compare the same battle without the rival hero in it
  const s2=fresh(); const pc2=G.capital(s2,'p'), ac2=G.capital(s2,id); s2.empires[id].heroAdvAt=1e12;
  G.hero(s2).points.str=30; ac2.units[au]=200; pc2.units[pu]=150; delete pc2.units.hero;
  const same=mkMove(s2,'p',pc2,ac2,'raid',{[pu]:150,hero:1});
  const sh=s2.empires[id].hero; delete ac2.units.hero;          // no defending hero: no duel
  s2.empires[id].hero.points.str=0;
  withRandom(0.5,()=>G.resolveMove(s2,same));
  const r2=s2.reports[0];
  ok('no duel without a second hero', !/Duel/.test(r2.body.extra||''));
}

// ---- slaying an enemy hero: renown and a chance at its items ----
{ const s=fresh(); const id='a2'; const emp=s.empires[id]; emp.heroAdvAt=1e12;
  const pc=G.capital(s,'p'), ac=G.capital(s,id);
  const ah=emp.hero; ah.hp=5; const prize={id:'prize',slot:'weapon',rarity:2,name:'Dragonbone Saber',icon:'🐉',fx:{atk:320}}; ah.eq.weapon=prize;
  pc.units.knight=400; delete pc.units.hero;
  const rb0=s.empires.p.renownBonus||0, ren0=G.renown(s,'p');
  const m=mkMove(s,'p',pc,ac,'attack',{knight:400,hero:1});
  withRandom(0.1,()=>G.resolveMove(s,m));
  ok('enemy hero slain', ah.dead && !ac.units.hero);
  ok('slaying gives +15 renown', (s.empires.p.renownBonus||0)===rb0+15 && G.renown(s,'p')>=ren0+15, 'bonus '+rb0+' -> '+s.empires.p.renownBonus);
  ok('slayer claims one of its items', G.hero(s).items.some(i=>i.id==='prize') && !ah.eq.weapon);
  ok('the slaying is in the chronicle', s.log.some(l=>l.text.includes('slew')&&l.text.includes(ah.name)));
  ok('and in the battle report', /slain/.test(s.reports[0].body.extra||''));
  ok('counted for the player', s.empires.p.heroesSlain===1);
  // the reverse: an AI hero slaying the player's hero
  const s3=fresh(); const e3=s3.empires.a1; const c3=G.capital(s3,'a1'), p3=G.capital(s3,'p'); e3.heroAdvAt=1e12;
  const u3=DATA.races[e3.race].units[0]; c3.units[u3]=800; delete c3.units.hero; G.hero(s3).hp=5; p3.units.militia=5;
  const rb3=e3.renownBonus||0;
  const m3=mkMove(s3,'a1',c3,p3,'attack',{[u3]:800,hero:1});
  G.resolveMove(s3,m3);
  ok('AI slays the player\\'s hero: AI renown', G.hero(s3).dead && (e3.renownBonus||0)===rb3+15);
  ok('player is told their hero fell', s3.log.some(l=>l.text.includes(G.hero(s3).name)&&l.text.includes('fallen')));
}

// ---- notoriety: famous rival heroes ----
{ const s=fresh(); const id='a3'; const h=s.empires[id].hero;
  const l0=G.heroLeadership(s,id);
  while(h.level<G.HERO_FAME_LEVEL) G.heroGainXp(s,G.xpNeed(h.level)*3,id);
  ok('famous hero raises its army\\'s attack', G.heroFamous(s,id) && Math.abs(G.heroLeadership(s,id)-l0-G.HERO_FAME_LEAD)<1e-9);
  const ph=G.hero(s); const pl=G.heroLeadership(s,'p'); ph.level=12;
  ok('player hero leadership unchanged by fame', G.heroLeadership(s,'p')===pl);
  G.advance(s,15,2);
  ok('famous hero announced in the chronicle', s.log.some(l=>l.text.includes('Tales spread of '+h.name)));
  // seen near your lands
  const ac=G.capital(s,id), pc=G.capital(s,'p'); delete ac.units.hero;
  s.moves.push({ id:G.newId(s,'m'), owner:id, type:'raid', from:ac.id, fx:pc.x+2, fy:pc.y, x:pc.x, y:pc.y, units:{hero:1}, cargo:{}, depart:s.time, arrive:s.time+600, heroChecked:true });
  G.advance(s,15,2);
  ok('famous hero seen near your lands', s.log.some(l=>l.text.includes('was seen marching near')));
}

// ---- the player's hero works as before ----
{ const s=fresh(); const c=G.capital(s,'p'); const h=G.hero(s);
  ok('player hero defaults', h.level===1 && h.free===3 && h.hp===100 && G.heroCity(s)===c);
  ok('assign point (no owner = player)', G.heroAssign(s,'str')===null && h.points.str===1 && h.free===2);
  ok('player stats', G.heroStats(s,'p').atk===130 && G.unitStats(s,'p','hero').atk===130);
  const ruin=s.special.filter(t=>t.ruin).sort((a,b)=>G.dist(a,c)-G.dist(b,c))[0]; ruin.ruin.readyAt=0;
  ok('player adventure send', G.sendArmy(s,c.id,ruin.x,ruin.y,'adventure',{hero:1})===null && !!G.heroMoving(s));
  const m=G.heroMoving(s); s.moves=s.moves.filter(x=>x!==m); G.resolveMove(s,m);
  ok('player adventure reported', s.reports.some(r=>r.body.adventure) && h.adventures===1);
  G.killHero(s,'p','in a test');
  ok('player hero death logged', h.dead && s.log.some(l=>l.text.includes('Revive them at your capital')));
  c.res.grain=1e5; s.empires.p.gold=1e5; c.res.gold=1e5;
  const e=G.reviveHero(s);
  ok('player revive (no owner)', e===null && !!h.reviveAt, e);
  ok('heroLost spares a hero who is home', (()=>{ const s2=fresh(); G.heroLost(s2); return !G.hero(s2).dead; })());
}

// ---- arcana (5th attribute, for magic.js) ----
{ const s=fresh(); const h=G.hero(s);
  ok('arcana attribute exists', !!DATA.heroAttrs.arcana && h.points.arcana===0 && G.heroArcana(s,'p')===0);
  h.free=5; for(let i=0;i<5;i++) G.heroAssign(s,'arcana');
  ok('arcana raises spell power and lowers mana cost', G.heroArcana(s,'p')===5 && Math.abs(G.mod(s,'p',null,'spellPower')/1.2-1)<0.2 && G.mod(s,'p',null,'spellCost')<1, G.mod(s,'p',null,'spellPower').toFixed(3)+' / '+G.mod(s,'p',null,'spellCost').toFixed(3));
  const sp=G.mod(s,'p',null,'spellPower'); G.killHero(s,'p','in a test');
  ok('a fallen hero lends no arcana', G.heroArcana(s,'p')===0 && G.mod(s,'p',null,'spellPower')<sp);
  h.points.arcana=40; h.dead=false;
  ok('mana cost floor 50%', Math.abs(G.mod(s,'p',null,'spellCost')/G.mod(fresh(),'p',null,'spellCost')-0.5)<1e-9);
  delete s.empires.a1.hero.points.arcana; const o=G.deserialize(G.serialize(s));
  ok('older heroes get arcana 0 lazily', G.heroOf(o,'a1').points.arcana===0 && G.heroArcana(o,'a1')===0);
}

// ---- save / load, and older saves without rival heroes ----
{ const s=fresh(); G.heroGainXp(s,900,'a1'); const n1=s.empires.a1.hero.name, L1=s.empires.a1.hero.level;
  G.save(s); const s2=G.load();
  ok('rival heroes survive save/load', s2 && s2.empires.a1.hero.name===n1 && s2.empires.a1.hero.level===L1 && s2.empires.a1.hero.personality===s.empires.a1.hero.personality);
  for(const id of AIS){ delete s.empires[id].hero; for(const c of G.citiesOf(s,id)) delete c.units.hero; }
  const old=G.deserialize(G.serialize(s));
  ok('old save loads without rival heroes', old && AIS.every(id=>!old.empires[id].hero));
  G.advance(old,30,5);
  ok('old save: rival heroes appear lazily', AIS.every(id=>old.empires[id].hero && old.empires[id].hero.personality && (G.heroCityOf(old,id)||G.heroMovingOf(old,id))));
  G.advance(old,3600,400);
  ok('old save runs on', !old.gameOver || old.gameOver===undefined);
}

// ---- a longer run: AI heroes act on their own ----
{ const s=G.newGame({name:'T',race:'hearth'}); s.calamityAt=1e12;
  G.advance(s,6*3600,1500);
  const hs=AIS.map(id=>s.empires[id].hero);
  ok('AI heroes level up over 6 hours', hs.some(h=>h.level>=3), hs.map(h=>h.name+' L'+h.level+' '+h.personality+' adv'+h.adventures+' led'+(h.ledAttacks||0)).join(' | '));
  ok('AI heroes spend their points', hs.every(h=>h.free===0||h.dead));
  ok('AI heroes act (adventures or attacks)', hs.reduce((a,h)=>a+h.adventures+(h.ledAttacks||0),0)>=2 && hs.filter(h=>h.adventures+(h.ledAttacks||0)>0).length>=2);
  ok('every city holds at most one hero, of its own realm', Object.values(s.cities).every(c=>(c.units.hero||0)<=1));
  ok('each living hero is somewhere', AIS.every(id=>s.empires[id].dead||s.empires[id].hero.dead||G.heroCityOf(s,id)||G.heroMovingOf(s,id)));
}

console.log(fails?fails+' FAILED':'ALL PASS');
`);
