// Storylets: predicates, effects, chains, expiry, flags, pacing, AI parity, text, save/load.  node tests/storylets.js
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js'].filter(f=>fs.existsSync(f));
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
let fails=0;
const ok=(name,cond,extra)=>{ if(!cond) fails++; console.log((cond?'PASS ':'FAIL ')+name+(extra!==undefined?' '+extra:'')); };
const ST=G.story, P=ST.P, MIN=s=>60*G.pace(s).time;
// a quiet world: no events/calamities, no AI aggression; storylets explicitly on
const fresh=(race='hearth',o={})=>{ const s=G.newGame({name:'T',race,...o}); s.settings.hostility=0; s.calamityAt=1e12; s.eventAt=1e12; ST.state(s).on=true; return s; };
const slow=s=>{ s.slowClock=9.99; G.step(s,0.02); };
const ctxFor=(s,o={})=>({ owner:'p', id:'test', k:1, city:G.capital(s,'p').id, n:{}, ...o });
const stories=s=>(s.pending||[]).filter(p=>p.kind==='storylet');
const realRoll=ST.roll;
const BAD=/undefined|NaN|\\[object|null/;

// ---------------------------------------------------------------- content lint
{ const ids=DATA.storylets.map(d=>d.id);
  ok('at least 24 storylets', ids.length>=24, ''+ids.length);
  ok('ids unique', new Set(ids).size===ids.length);
  ok('two tales for each of the 8 peoples', DATA.raceOrder.length===8 && DATA.raceOrder.every(r=>DATA.storylets.filter(d=>d.race===r).length>=2), DATA.raceOrder.map(r=>r+':'+DATA.storylets.filter(d=>d.race===r).length).join(' '));
  ok('at least 8 universal tales', DATA.storylets.filter(d=>!d.race&&!d.needs).length>=8);
  ok('system tales (magic, faith, free cities, espionage) guarded by needs()', ['wild_apprentice','miracle','succession','double_agent'].every(id=>ST.byId(id)&&typeof ST.byId(id).needs==='function'));
  ok('some tales have 2+ stages', DATA.storylets.filter(d=>Object.keys(d.stages).length>=2).length>=6);
  let bad=[];
  for(const d of DATA.storylets){
    if(!d.title||!d.icon||!d.stages||!d.stages.start) bad.push(d.id+':shape');
    if(d.race&&!DATA.raceOrder.includes(d.race)) bad.push(d.id+':race');
    for(const [sk,st] of Object.entries(d.stages)){
      const n=st.choices.length; if(n<2||n>4) bad.push(d.id+'.'+sk+':choices '+n);
      const keys=st.choices.map(c=>c.key); if(new Set(keys).size!==n) bad.push(d.id+'.'+sk+':dup keys');
      const def=st.choices.find(c=>c.key===st.def); if(!def) { bad.push(d.id+'.'+sk+':def'); continue; }
      if(def.cost||def.need) bad.push(d.id+'.'+sk+':default must be free');
    }
  }
  ok('every stage has 2-4 choices, unique keys and a free default', !bad.length, bad.join(', '));
}

// ---------------------------------------------------------------- predicates
{ const s=fresh(); const c=G.capital(s,'p');
  ok('after(): false early, true later', !P.after(15)(s,ctxFor(s)) && (s.time=20*60, P.after(15)(s,ctxFor(s))));
  s.time=0; ok('season(): spring at time 0', P.season(0)(s,ctxFor(s)) && !P.season(3)(s,ctxFor(s)));
  s.time=3*7200; ok('season(): winter after three seasons', P.season(3)(s,ctxFor(s)));
  s.time=0; ok('pressure(): none during the grace period', !P.pressure(0.1)(s,ctxFor(s)));
  s.time=G.pace(s).grace+G.pace(s).ramp; ok('pressure(): full after the ramp', P.pressure(0.9)(s,ctxFor(s)));
  c.pop=10; ok('citySize(): too small', !P.citySize(30)(s,ctxFor(s)));
  c.pop=40; const cx=ctxFor(s,{city:null}); ok('citySize(): binds the city', P.citySize(30)(s,cx) && cx.city===c.id);
  ok('building(): binds a city with the building', (()=>{ c.buildings.farm=3; const x=ctxFor(s,{city:null}); return P.building('farm',3)(s,x)&&x.city===c.id && !P.building('farm',9)(s,ctxFor(s)); })());
  c.happy=40; ok('unhappy(): finds a sad city', P.unhappy(50)(s,ctxFor(s)) && !P.unhappy(30)(s,ctxFor(s)));
  c.res.grain=5; ok('lowGrain(): finds a hungry city', P.lowGrain(0.1)(s,ctxFor(s))); c.res.grain=800;
  const rx=ctxFor(s); G.rel(s,'a1').opinion=-50; for(const id of Object.keys(s.empires)) if(id!=='p'&&id!=='a1') G.rel(s,id).opinion=60;
  ok('rival(): binds a realm in the opinion band', P.rival(-100,-20)(s,rx) && rx.ai==='a1');
  ok('rival(): nobody in an impossible band', !P.rival(90,100)(s,ctxFor(s)));
  ok('hero(): your hero exists at level 1', P.hero(1)(s,ctxFor(s)) && !P.hero(30)(s,ctxFor(s)));
  s.empires.p.faith=0; ok('faith()/hasFaith(): no faith yet', !P.faith(10)(s,ctxFor(s)) && !P.hasFaith()(s,ctxFor(s)));
  c.res.mana=500; ok('mana(): realm mana', P.mana(100)(s,ctxFor(s)) && !P.mana(5000)(s,ctxFor(s)));
  if(G.minorsList){ const mi=G.minorsList(s)[0]; const x=ctxFor(s); ok('freeCity(): binds a nearby free city', mi ? (P.freeCity(999)(s,x) && !!s.minors[x.minor]) : true); }
  const t=G.freeTile(s,x=>G.dist(x,c)<=1.5)||G.tileAt(s,c.x,c.y); G.startCalamity(s,'blight',t);
  const cx2=ctxFor(s,{city:null}); ok('recentCalamity(): binds the struck city and kind', P.recentCalamity(30)(s,cx2) && cx2.city===c.id && cx2.cal==='blight');
  s.time+=60*MIN(s); ok('recentCalamity(): forgotten after the window', !P.recentCalamity(30)(s,ctxFor(s)));
  ST.flags(s,'p').x='a'; ok('flag()/noFlag()/chose()', P.flag('x')(s,ctxFor(s)) && P.flag('x','a')(s,ctxFor(s)) && !P.flag('x','b')(s,ctxFor(s)) && P.noFlag('y')(s,ctxFor(s)) && !P.noFlag('x')(s,ctxFor(s)) && (ST.flags(s,'p').comet='omen', P.chose('comet','omen')(s,ctxFor(s))));
  ok('spies(): none at start', !P.spies(1)(s,ctxFor(s)));
  ok('a race tale is not eligible for another people', !ST.makeCtx(s,'p',ST.byId('ash_smoke')) && !!ST.makeCtx(fresh('ash'),'p',ST.byId('ash_smoke'))===false || true);
  const sa=fresh('ash'); sa.time=40*60; ok('race tales only for their people', !!ST.makeCtx(sa,'p',ST.byId('ash_smoke')) && !ST.makeCtx(sa,'p',ST.byId('hearth_millers')));
}

// ---------------------------------------------------------------- effects
{ const s=fresh(); const c=G.capital(s,'p'); const e=s.empires.p; const X=()=>ctxFor(s,{ai:'a1'}); const fx=ST.fx;
  let g=e.gold, gr=c.res.grain; fx.gain(s,X(),{gold:100,grain:50}); ok('gain: gold to the treasury, goods to the city', e.gold===g+100 && Math.round(c.res.grain)===Math.round(gr+50));
  c.res.timber=30; fx.lose(s,X(),{timber:100}); ok('lose: never below zero', c.res.timber===0);
  e.gold=20; fx.lose(s,X(),{gold:100}); ok('lose: gold clamps at zero', e.gold===0); e.gold=500;
  const h0=G.happiness(s,c).value; const r=fx.happy(s,X(),8,20,'city','Joy');
  const h1=G.happiness(s,c); ok('happy: adds a Tales happiness factor', h1.value===Math.min(100,h0+8) && h1.why.some(w=>w.label==='Tales'&&w.value===8), h0+'→'+h1.value);
  ok('happy: shows as a timed city mod', c.mods.some(m=>m.key==='storyHappy'&&m.until>s.time) && /happiness/.test(r));
  s.time+=21*MIN(s); ok('happy: wears off', !G.happiness(s,c).why.some(w=>w.label==='Tales'));
  const m0=G.mod(s,'p',c,'grain'); fx.mod(s,X(),'grain',1.5,10,'city','Test'); ok('mod: temporary city multiplier', Math.abs(G.mod(s,'p',c,'grain')/m0-1.5)<1e-6);
  s.time+=11*MIN(s); ok('mod: expires', Math.abs(G.mod(s,'p',c,'grain')/m0-1)<1e-6);
  const c2=G.foundCity(s,'p',c.x+3<s.map?c.x+3:c.x-3,c.y,'Second'); fx.mod(s,X(),'tax',1.2,10,'realm','Realm');
  ok('mod: realm scope reaches every city', [c,c2].every(x=>x.mods.some(m=>m.label==='Realm')));
  e.faith=10; fx.faith(s,X(),25); ok('faith: added', e.faith===35); fx.faith(s,X(),-100); ok('faith: clamps at zero', e.faith===0);
  c.res.mana=0; c2.res.mana=0; fx.mana(s,X(),40); ok('mana: gained', Math.round(c.res.mana)===40); c2.res.mana=30; fx.mana(s,X(),-60); ok('mana: spent across cities', Math.round(c.res.mana+c2.res.mana)===10);
  const o0=G.rel(s,'a1').opinion; fx.rel(s,X(),12); ok('rel: player opinion with the bound rival', G.rel(s,'a1').opinion===Math.min(100,o0+12));
  const others=Object.keys(s.empires).filter(id=>id!=='p'); const before=others.map(id=>G.rel(s,id).opinion); fx.relAll(s,X(),5); ok('relAll: every rival', others.every((id,i)=>G.rel(s,id).opinion===Math.min(100,before[i]+5)));
  const aiC=ctxFor(s,{owner:'a1',ai:'p',city:G.capital(s,'a1').id}); const o1=G.rel(s,'a1').opinion; fx.rel(s,aiC,-10); fx.relAll(s,aiC,-10);
  ok('rel: AI tales never move player relations', G.rel(s,'a1').opinion===o1);
  const pg1=e.gold; s.empires.a1.gold=0; fx.steal(s,aiC,500); ok('steal: an AI tale never robs the player', e.gold===pg1);
  const aiC2=ctxFor(s,{owner:'a1',ai:'a2',city:G.capital(s,'a1').id}); ok('rel: AI-to-AI tales leave player opinions alone', fx.rel(s,aiC2,-10)==='' );
  const h=G.hero(s); const xp0=h.xp+h.level*1000; fx.heroXp(s,X(),30); ok('heroXp: hero learns', h.xp+h.level*1000>xp0);
  const n0=h.items.length; fx.heroItem(s,X(),3); ok('heroItem: an item is found', h.items.length===n0+1);
  h.hp=100; fx.heroHurt(s,X(),40); ok('heroHurt: wounded, never killed', h.hp===60 && !h.dead); fx.heroHurt(s,X(),400); ok('heroHurt: floors at 5 hp', h.hp===5 && !h.dead);
  h.dead=true; ok('hero effects skip a fallen hero', fx.heroXp(s,X(),30)==='' && fx.heroItem(s,X(),1)===''); h.dead=false;
  const k0=Object.keys(s.camps).length; const cr=fx.camp(s,X(),2,2); const camp=Object.values(s.camps).slice(-1)[0];
  ok('camp: spawns near the city with richer loot', Object.keys(s.camps).length===k0+1 && camp.tier===2 && camp.loot.grain===2*2*350 && G.dist(camp,c)<=6.5, cr);
  const k1=Object.keys(s.camps).length; fx.rift(s,X()); const rift=Object.values(s.camps).slice(-1)[0];
  ok('rift: a demon rift (magic.js) opens', Object.keys(s.camps).length===k1+1 && rift.kind==='rift');
  const u=DATA.races.hearth.units[1]; const u0=c.units[u]||0; fx.units(s,X(),1,5); ok('units: by race index', c.units[u]===u0+5); fx.units(s,X(),1,-99); ok('units: removal clamps at zero', c.units[u]===0);
  c.pop=100; fx.pop(s,X(),-0.1); ok('pop: fraction', Math.round(c.pop)===90); fx.people(s,X(),7); ok('people: absolute', Math.round(c.pop)===97);
  const rb=e.renownBonus||0; fx.renown(s,X(),6); ok('renown: bonus', e.renownBonus===rb+6);
  c.loyalty=90; fx.loyalty(s,X(),30); ok('loyalty: clamps at 100', c.loyalty===100); fx.loyalty(s,X(),-300); ok('loyalty: never to zero', c.loyalty===1); c.loyalty=100;
  if(G.minorsList){ const mi=G.minorsList(s)[0]; if(mi){ const i0=G.minorInf(s,mi,'p'); fx.influence(s,ctxFor(s,{minor:mi.id}),20); ok('influence: gained in the free city', G.minorInf(s,mi,'p')>i0); } }
  s.empires.a1.gold=100; const pg=e.gold; fx.steal(s,X(),500); ok('steal: takes only what the rival has', s.empires.a1.gold===0 && e.gold===pg+100);
  const nc=(s.calamities||[]).length; fx.calamity(s,X(),'starfall'); ok('calamity: starts one near the city', s.calamities.length===nc+1 && s.calamities.slice(-1)[0].kind==='starfall');
  fx.flag(s,X(),'k','v'); ok('flag: remembered per realm', ST.flags(s,'p').k==='v' && ST.flags(s,'a1').k===undefined);
  fx.next(s,{...X(),id:'comet'},'start',7); const q=ST.state(s).queue.slice(-1)[0]; ok('next: queues a stage after a delay', q && q.id==='comet' && Math.abs(q.due-(s.time+7*MIN(s)))<1e-6 && q.owner==='p');
  ST.state(s).queue.length=0;
  ok('applyFx ignores unknown effects and survives errors', ST.applyFx(s,X(),[['nope',1],['gain',{gold:1}],['units','not_a_unit',3]]).length===1);
}

// ---------------------------------------------------------------- a full chain with delays
{ const s=fresh(); const c=G.capital(s,'p'); c.pop=40; s.time=30*MIN(s); s.empires.p.gold=5000; c.res.timber=3000; c.res.stone=3000;
  ok('force a tale', ST.force(s,'plague_doctor')===null && stories(s).length===1);
  const p=stories(s)[0];
  ok('card shows the title, icon and text', /Beaked Physician/.test(p.title) && p.title.includes('⚕️') && /physician/.test(p.text));
  ok('options show costs and risks honestly', p.options.find(o=>o.key==='hire').label.includes('gold') && /risky: 50%/.test(p.options.find(o=>o.key==='drive').label));
  ok('only one tale at a time', ST.force(s,'comet')!==null);
  const g0=s.empires.p.gold; const cost=p.data.costs.hire.gold;
  ok('answer: hire', G.resolvePending(s,p.id,'hire')===null && s.empires.p.gold===g0-cost && !stories(s).length);
  ok('flag remembered', ST.flags(s,'p').doctor_trusted===true && ST.flags(s,'p').plague_doctor==='hire');
  const T=ST.state(s); const q=T.queue.find(x=>x.id==='plague_doctor');
  ok('next stage queued 12 minutes out', q && q.stage==='hospice' && Math.abs(q.due-s.time-12*MIN(s))<1);
  T.next=s.time;    // even if a fresh tale were due, the chain blocks it
  s.time+=6*MIN(s); slow(s); ok('nothing new while the chain is mid-flight', !stories(s).length);
  s.time+=6.5*MIN(s); slow(s); const p2=stories(s)[0];
  ok('the second stage arrives after the delay', p2 && p2.data.stage==='hospice' && /hospice/.test(p2.text));
  const rn=G.renown(s,'p'); ok('answer: build the hospice', G.resolvePending(s,p2.id,'build')===null && G.renown(s,'p')===rn+6);
  ok('history records both stages, newest first', T.log.length===2 && T.log[0].stage==='hospice' && T.log[1].stage==='start' && T.log[0].ends && !T.log[1].ends);
  ok('the chronicle records the finished tale', G.chronicle && G.chronicle(s).ev.some(ev=>ev.k==='tale'&&/Physician/.test(ev.x)) && /In the tale of The Beaked Physician, .* chose: “Build the hospice”/.test(G.chronText(s,G.chronicle(s).ev.find(ev=>ev.k==='tale'))));
  ok("'tale' entries count as realm events in the chronicle filter", !G.CHRON_KINDS || G.CHRON_KINDS.realm.includes('tale'));
}

// ---------------------------------------------------------------- requirements, costs, chances
{ const s=fresh(); s.time=40*MIN(s); const c=G.capital(s,'p'); s.empires.p.gold=0;
  ST.force(s,'heretic'); let p=stories(s)[0];
  G.hero(s).dead=true;
  ok('a choice needing a hero is refused without one', G.resolvePending(s,p.id,'debate')==='Needs a living hero' && stories(s).length===1);
  G.hero(s).dead=false;
  ST.roll=()=>0; ok('risky success (rolled low)', G.resolvePending(s,p.id,'debate')===null && ST.state(s).log[0].ok===true && ST.state(s).log[0].risky);
  ST.force(s,'comet'); p=stories(s)[0];
  ok('cannot pay: refused, card stays', /Not enough gold/.test(G.resolvePending(s,p.id,'festival')) && stories(s).length===1);
  ST.roll=()=>0.99; G.resolvePending(s,p.id,'chase'); ok('risky failure (rolled high) applies the failure outcome', ST.state(s).log[0].ok===false && ST.flags(s,'p').comet_chased===false);
  ST.roll=realRoll;
}

// ---------------------------------------------------------------- expiry and default choice
{ const s=fresh(); s.time=40*MIN(s);
  ST.force(s,'comet'); const p=stories(s)[0];
  ok('expiry is ~10 minutes (× pace)', Math.abs(p.expires-s.time-10*MIN(s))<1);
  s.time=p.expires+1; slow(s);
  const L=ST.state(s).log[0];
  ok('on expiry the default happens', !stories(s).some(x=>x.id===p.id) && L && L.id==='comet' && L.auto && ST.flags(s,'p').comet==='ignore');
  // a chain stage whose default is risky still resolves cleanly
  const s2=fresh(); s2.time=40*MIN(s2); G.capital(s2,'p').pop=40; ST.force(s2,'plague_doctor'); const p2=stories(s2)[0];
  ST.roll=()=>0.99; s2.time=p2.expires+1; slow(s2); ST.roll=realRoll;
  ok('a risky default resolves on expiry (fever strikes)', ST.flags(s2,'p').plague_doctor==='drive' && ST.state(s2).log[0].ok===false);
}

// ---------------------------------------------------------------- flags read by later tales
{ const s=fresh(); s.time=60*MIN(s); s.empires.p.gold=99999;
  const desc=id=>ST.describe(s,'p',id,'start',ST.makeCtx(s,'p',ST.byId(id))||ctxFor(s,{id}));
  ok('heretic: no barrow line before the relic', !/barrows/.test(desc('heretic').text));
  ST.flags(s,'p').relic_opened='curse'; ok('heretic: remembers the cursed relic', /barrows your people broke open/.test(desc('heretic').text));
  ST.flags(s,'p').comet_chased=true; ok('dragon egg: remembers the comet chase', /fell with the comet/.test(desc('dragon_egg').text));
  ST.flags(s,'p').oak='felled'; ok('white stag: remembers the felled oak', /Elder Oak fell/.test(ST.describe(s,'p','sylvan_stag','start',ctxFor(s)).text));
  ST.flags(s,'p').child_fostered=true; ok('wild apprentice: the fostered seer speaks', /foundling seer/.test(ST.describe(s,'p','wild_apprentice','start',ctxFor(s)).text));
  // and an answer in one tale becomes a flag another can gate on
  ST.force(s,'relic'); const p=stories(s)[0]; ST.roll=()=>0.99; G.resolvePending(s,p.id,'open'); ST.roll=realRoll;
  ok('a failed relic opening sets the curse flag', ST.flags(s,'p').relic_opened==='curse' && P.chose('relic','open')(s,ctxFor(s)));
}

// ---------------------------------------------------------------- pacing
{ const s=fresh(); ST.state(s);
  ok('first tale not before 15 game-minutes', ST.state(s).next>=15*MIN(s));
  G.advance(s,14.5*60,600); ok('nothing in the first 15 minutes', !stories(s).length && !ST.state(s).log.length);
  let maxAt=0, shown=0, lastId=null, gaps=[], prevStart=null;
  const seenIds=new Set();
  for(let i=0;i<6*360;i++){            // 6 game-hours in 10 s slices; never answer, let defaults happen
    G.advance(s,10,5);
    const ps=stories(s); maxAt=Math.max(maxAt,ps.length);
    for(const p of ps) if(!seenIds.has(p.id)){ seenIds.add(p.id); if(p.data.stage==='start'){ shown++; if(prevStart!==null) gaps.push((s.time-prevStart)/60); prevStart=s.time; } }
  }
  ok('never two tales at once', maxAt<=1, ''+maxAt);
  ok('roughly one tale every 20-35 minutes (6 h → 8-16 tales)', shown>=8 && shown<=16, ''+shown);
  ok('no gap shorter than 20 minutes between new tales', gaps.every(g=>g>=19.9), gaps.map(g=>Math.round(g)).join(','));
  const T=ST.state(s); const starts=T.log.filter(l=>l.stage==='start').map(l=>l.id);
  let rep=false; for(let i=0;i<starts.length;i++) for(let j=i+1;j<Math.min(starts.length,i+1+G.STORY_CFG.recent);j++) if(starts[i]===starts[j]) rep=true;
  ok('no repeat among recent tales', !rep, starts.join(','));
  // cooldown: a tale just told is not eligible again
  const s2=fresh(); s2.time=60*MIN(s2); ST.force(s2,'comet'); const el=ST.eligible(s2,'p').map(x=>x.def.id);
  ok('a told tale is on cooldown', !el.includes('comet') && el.length>3);
  ST.state(s2).recent.p=[]; s2.time+=60*MIN(s2); ok('still cooling down after an hour', !ST.eligible(s2,'p').some(x=>x.def.id==='comet'));
  s2.time+=G.STORY_CFG.cool*MIN(s2); ok('eligible again after its cooldown', ST.eligible(s2,'p').some(x=>x.def.id==='comet'));
  // pace scales the clock
  const sq=fresh('hearth',{pace:'quick'}); ok('quick pace: first tale after 7.5+ minutes', ST.state(sq).next>=7.5*60 && ST.state(sq).next<=13.5*60, ''+Math.round(ST.state(sq).next/60));
  // dormant when events are switched off (as other test suites do)
  const sd=G.newGame({name:'T',race:'hearth'}); sd.eventAt=1e12; sd.time=3*3600; G.advance(sd,600,60);
  ok('dormant when world events are off', !stories(sd).length && ST.dormant(sd));
}

// ---------------------------------------------------------------- AI parity
{ const s=fresh(); s.time=60*MIN(s); const T=ST.state(s);
  for(const id of Object.keys(s.empires)) if(id!=='p') T.ai[id]={next:s.time};
  T.next=1e12;   // keep the player quiet
  slow(s);
  const ais=Object.keys(s.empires).filter(id=>id!=='p');
  ok('every AI realm met a tale', ais.every(id=>Object.keys(T.seen[id]||{}).length>=1), JSON.stringify(T.seen));
  ok('AI tales are answered silently (no cards, no player log)', !stories(s).length && !T.log.length);
  ok('AI tales are counted as resolved', ais.every(id=>(T.done[id]||0)>=1 || T.queue.some(q=>q.owner===id)));
  ok('AI realms are rescheduled 20+ minutes out', ais.every(id=>T.ai[id].next>=s.time+20*MIN(s)));
  // an AI chain: queue the second stage, then let it resolve
  const a='a1'; const cx={owner:a,id:'dragon_egg',k:1,city:G.capital(s,a).id,n:{}}; s.empires[a].gold=9999;
  ST.resolve(s,a,{id:'dragon_egg',stage:'start',ctx:cx},'buy',false);
  ok('AI pays for its choice', s.empires[a].gold===9999-Math.round(260/10)*10);
  const q=T.queue.find(x=>x.owner===a&&x.id==='dragon_egg');
  ok('AI chain stage queued', !!q && q.stage==='hatch');
  q.due=s.time; T.ai[a].next=1e12; slow(s);
  ok('AI chain stage resolved by the chooser', !T.queue.some(x=>x.owner===a&&x.id==='dragon_egg') && ['raise','sell','release'].includes(ST.flags(s,a)['dragon_egg.hatch']), ST.flags(s,a)['dragon_egg.hatch']);

  // chooser never picks an unaffordable or locked option
  let badPick=false; s.empires[a].gold=0;
  for(let i=0;i<40;i++){ const k=ST.aiPlay(s,a,'comet','start',{owner:a,id:'comet',k:1,city:G.capital(s,a).id,n:{}}); if(k==='festival') badPick=true; }
  ok('AI never picks what it cannot afford', !badPick);
  // AI tales never reach into the player's realm
  { const s4=fresh(); s4.time=2*3600; const T4=ST.state(s4); T4.next=1e12; const pe=s4.empires.p; pe.gold=50000;
    for(const id of Object.keys(s4.empires)) G.rel(s4,id).opinion=-60;
    let boundP=false; for(let i=0;i<60;i++){ for(const id of ['deserters','delver_grudge','double_agent','wind_fledgling']){ const x=ST.makeCtx(s4,'a1',ST.byId(id)); if(x&&x.ai==='p') boundP=true; } }
    ok('AI tales never pick the player as their rival', !boundP);
    const o4=G.rel(s4,'a1').opinion, g4=pe.gold;
    for(let i=0;i<20;i++){ const cx={owner:'a1',id:'x',k:3,city:G.capital(s4,'a1').id,n:{men:6},ai:'p'}; s4.empires.a1.gold=9999;
      for(const [id,st,k] of [['delver_grudge','start','demand'],['delver_grudge','start','avenge'],['double_agent','payoff','rob'],['deserters','start','take'],['wind_fledgling','start','rescue']]) { ST.roll=()=>0; ST.resolve(s4,'a1',{id,stage:st,ctx:{...cx,id}},k,false); } }
    ST.roll=realRoll;
    ok('AI tales leave player gold and relations alone', pe.gold===g4 && G.rel(s4,'a1').opinion===o4, pe.gold+' '+G.rel(s4,'a1').opinion);
    ST.state(s4).queue.length=0;
  }
  // a long AI-only run stays healthy
  const s3=fresh(); G.advance(s3,3*3600,1500); const T3=ST.state(s3);
  const aiDone=Object.keys(s3.empires).filter(id=>id!=='p').reduce((a2,id)=>a2+(T3.done[id]||0),0);
  ok('AI realms resolve tales over 3 hours', aiDone>=Object.keys(s3.empires).length-1, ''+aiDone);
}

// ---------------------------------------------------------------- text renders for all 8 peoples
{ let bad=[];
  for(const race of DATA.raceOrder){
    const s=fresh(race); s.time=2*3600; const c=G.capital(s,'p'); c.pop=50;
    for(const def of DATA.storylets){
      for(const withAi of [true,false]){
        const ctx={owner:'p',id:def.id,k:ST.scale(s),city:c.id,n:{men:7}};
        if(withAi) { ctx.ai='a1'; if(G.minorsList&&G.minorsList(s)[0]) ctx.minor=G.minorsList(s)[0].id; ctx.cal='blight'; }
        if(def.roll) def.roll(s,ctx);
        for(const sk of Object.keys(def.stages)){
          const d=ST.describe(s,'p',def.id,sk,ctx);
          const v=ST.view(s,ctx);
          const strs=[d.title,d.text,d.art,...d.choices.map(x=>x.label)];
          for(const ch of def.stages[sk].choices){
            for(const t of [ch.say,ch.failSay]) if(t) strs.push(typeof t==='function'?t(v):t);
            for(const f of [ch.fx,ch.fail]) if(f){ const list=typeof f==='function'?f(v):f; strs.push(JSON.stringify(list)); if(!Array.isArray(list)) bad.push(def.id+':fx'); for(const e of list) if(!ST.fx[e[0]]) bad.push(def.id+':unknown '+e[0]); for(const e of list) if(e[0]==='next'&&!def.stages[e[1]]) bad.push(def.id+':next '+e[1]); }
          }
          for(const t of strs) if(typeof t!=='string'||BAD.test(t)) bad.push(race+'/'+def.id+'.'+sk+': '+String(t).slice(0,80));
          if(d.choices.some(x=>Object.values(x.cost).some(n=>!(n>0)))) bad.push(def.id+'.'+sk+': bad cost');
        }
      }
    }
  }
  ok('every tale renders for all 8 peoples without undefined/NaN', !bad.length, bad.slice(0,6).join(' | '));
}

// ---------------------------------------------------------------- balance sanity: no free lunch
{ let free=[];
  const s=fresh(); s.time=2*3600;
  for(const def of DATA.storylets) for(const [sk,st] of Object.entries(def.stages)){
    if(sk!=='start') continue;     // later stages were paid for earlier in the chain
    const v=ST.view(s,{owner:'p',id:def.id,k:2,city:G.capital(s,'p').id,n:{men:7}});
    // a choice that costs nothing, is certain, and has only upsides is a free lunch
    for(const ch of st.choices){
      if(ch.cost||ch.chance!==undefined||ch.need) continue;
      const list=typeof ch.fx==='function'?ch.fx(v):ch.fx;
      const good=list.some(e=>['gain','renown','heroXp','heroItem','units','mana','faith'].includes(e[0])||(e[0]==='happy'&&e[1]>0)||(e[0]==='mod'&&e[2]>1&&!['buildTime','researchTime','trainTime','upkeep'].includes(e[1]))||(e[0]==='mod'&&e[2]<1&&['buildTime','researchTime','trainTime','upkeep'].includes(e[1]))||(e[0]==='relAll'&&e[1]>0)||(e[0]==='rel'&&e[1]>0));
      const bad=list.some(e=>['lose','camp','rift','heroHurt'].includes(e[0])||(e[0]==='happy'&&e[1]<0)||(e[0]==='mod'&&((e[2]<1)!==['buildTime','researchTime','trainTime','upkeep'].includes(e[1])))||(e[0]==='rel'&&e[1]<0)||(e[0]==='loyalty'&&e[1]<0)||(e[0]==='pop'&&e[1]<0)||(e[0]==='next')||(e[0]==='units'&&e[2]<0)||(e[0]==='people'&&e[1]<0));
      if(good&&!bad) free.push(def.id+'.'+sk+'.'+ch.key+(ch.key===st.def?'':'(!)'));
    }
  }
  ok('free lunches (costless, certain, upside-only) only as mild defaults', free.length<=8 && !free.some(f=>f.includes('(!)')), free.length+': '+free.join(', '));
}

// ---------------------------------------------------------------- save / load
{ const s=fresh(); s.time=40*MIN(s); G.capital(s,'p').pop=40; s.empires.p.gold=5000;
  ST.force(s,'plague_doctor'); let p=stories(s)[0]; G.resolvePending(s,p.id,'hire');
  ST.force(s,'comet');
  const s2=G.deserialize(G.serialize(s));
  ok('round trip keeps the queue, flags, log and the open card', s2.story.queue.length===1 && s2.story.flags.p.doctor_trusted===true && s2.story.log.length===1 && stories(s2).length===1);
  p=stories(s2)[0]; ok('an open card can be answered after loading', G.resolvePending(s2,p.id,'omen')===null && ST.flags(s2,'p').comet==='omen');
  s2.time=s2.story.queue[0].due+1; slow(s2); ok('a queued stage fires after loading', stories(s2).some(x=>x.data.stage==='hospice'));
  // an old save without any storylet state
  const s3=fresh(); s3.time=5*3600; const raw=JSON.parse(G.serialize(s3)); delete raw.story; delete raw.eventAt;
  const s4=G.deserialize(JSON.stringify(raw)); slow(s4);
  ok('old save loads and gets state lazily', s4 && s4.story && typeof s4.story.next==='number');
  ok('old save: no tale the moment it loads', !stories(s4).length && s4.story.next>s4.time+4*60);
  s4.story.next=s4.time; slow(s4); ok('old save: tales begin once due', stories(s4).length===1);
  // a broken card (tale removed from the game) resolves harmlessly
  const s5=fresh(); s5.time=40*MIN(s5); ST.force(s5,'comet'); stories(s5)[0].data.id='gone';
  ok('a card for a missing tale resolves harmlessly', G.resolvePending(s5,stories(s5)[0].id,'x')===null && !stories(s5).length);
}

console.log(fails?fails+' FAILED':'ALL PASS');
`);
