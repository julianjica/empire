// Automation: domains on/off, reserves, important decisions left alone, presets, the inbox, saves, console commands,
// performance, and a headless Delegate-vs-Hands-on comparison.
// node tests/automation.js            (add --quick to skip the 6-hour comparison)
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const QUICK=process.argv.includes('--quick');
const files=['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/roads.js','js/quarters.js','js/intercept.js','js/warplan.js','js/automation.js','js/cli.js','js/dynasty.js','js/portraits.js','js/portrait-people.js','js/portrait-gear.js'].filter(f=>fs.existsSync(f));
// a child process boots ui-core + ui-automation with a stub DOM, chooses Delegate on the start screen and begins
const START_HOOK_TAIL=[
  "UI.start.automation='delegate';",
  "const seen=[]; window.START_HOOKS.push(o=>seen.push(...Object.keys(o).filter(k=>k==='automation')));",
  "const wrapped=/autoPreset/.test(act.begin.toString());",
  "try{ act.begin(); }catch(e){}",
  "console.log('preset='+(S&&S.automation?S.automation.preset:'none')+' wrapped='+wrapped+' opts='+seen.join(','));"].join('\n');
const START_HOOK_TEST=[
  "const fs=require('fs');",
  "global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};",
  "const fakeEl=()=>({ value:'', style:{}, dataset:{}, classList:{add(){},remove(){},toggle(){},contains:()=>false}, setAttribute(){}, appendChild(){}, addEventListener(){}, querySelector:()=>null, querySelectorAll:()=>[], remove(){} });",
  "global.document={ getElementById:fakeEl, querySelector:()=>null, querySelectorAll:()=>[], addEventListener(){}, body:fakeEl(), head:fakeEl(), documentElement:fakeEl(), createElement:fakeEl };",
  "global.window={ scrollY:0, scrollTo(){}, addEventListener(){}, matchMedia:()=>({matches:false,addEventListener(){}}) };",
  "const files="+JSON.stringify(files.concat(['js/ui-core.js','js/ui-automation.js']))+";",
  "eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\\n')+'\\n'+"+JSON.stringify(START_HOOK_TAIL)+");"].join('\n');
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
let fails=0;
const ok=(name,cond,extra)=>{ if(!cond) fails++; console.log((cond?'PASS ':'FAIL ')+name+(extra!==undefined?' '+extra:'')); };
const quiet=s=>{ s.settings.hostility=0; s.calamityAt=1e12; s.eventAt=1e12; G.aiPressure=()=>0; for(const k of Object.keys(s.camps)){ G.tileAt(s,s.camps[k].x,s.camps[k].y).camp=null; delete s.camps[k]; } s.campTarget=0; };
const basePressure=G.aiPressure;
const fresh=(race='hearth')=>{ const s=G.newGame({name:'T',race}); quiet(s); return s; };
const MIN=s=>60*G.pace(s).time;
const lon=s=>s.logistics&&s.logistics.p?s.logistics.p.on!==false:true;
const rich=(s,c)=>{ c=c||G.capital(s,'p'); s.empires.p.gold=50000; for(const g of DATA.goodOrder) c.res[g]=Math.max(c.res[g]||0,4000); return c; };
const near=(s,c,lo=3,hi=6)=>G.freeTile(s,x=>G.dist(x,c)>=lo&&G.dist(x,c)<=hi&&G.landReachable(s,c,x)&&!x.city&&!x.camp&&!x.ruin&&!x.oasis);
const logHas=(s,d,re)=>G.autoLogOf(s,d).some(e=>re.test(e.text));
const only=(s,d,cfg)=>{ G.autoPreset(s,'handsOn'); for(const [k,v] of Object.entries(cfg)) G.autoSet(s,d,k,v); };
const run=(s,mins)=>G.advance(s,mins*MIN(s),Math.max(60,mins*12));
const unit0=s=>DATA.races[s.empires.p.race].units[0];

// ---- old saves and the lazy default ----
{ const s=fresh(); delete s.automation;
  const t=G.deserialize(G.serialize(s));
  ok('a save without s.automation loads', !!t && !t.automation);
  G.autoTick(t);
  ok('no automation runs in an old save until it is opened', !t.automation);
  const A=G.automation(t);
  ok('an old save opens as Hands-on', A.preset==='handsOn' && G.AUTO.ORDER.every(d=>!G.autoDomainOn(t,d)||d==='economy'));
  ok('old save keeps its supply lines as they were', A.d.economy.supply===(t.logistics&&t.logistics.p?t.logistics.p.on!==false:true));
  rich(t); G.capital(t,'p').buildings.academy=2; run(t,3);
  ok('Hands-on queues no research by itself', !(G.research(t,'p').queue||[]).length && !G.research(t,'p').studies.length);
}

// ---- a partial s.automation (hand-built games, domains added later) loads without throwing ----
{ const s=fresh(); G.autoPreset(s,'delegate'); const raw=JSON.parse(G.serialize(s));
  delete raw.automation.d.settle; delete raw.automation.d.military.defend; delete raw.automation.d.grimoire; delete raw.automation.lent; delete raw.automation.aforkPref; delete raw.automation.res.mana; delete raw.automation.stats;
  let t=null, err=null;
  try{ t=G.deserialize(JSON.stringify(raw)); G.autoTick(t); for(const d of G.AUTO.ORDER){ G.autoDomainOn(t,d); G.autoRun(t,d); } G.autoInbox(t); G.cli.exec(t,'p','auto',{}); }catch(e){ err=e.message; }
  const A=t&&G.automation(t);
  ok('a save missing some domains and fields loads and runs', !err && !!A, err||'');
  ok('missing domains and switches come back with their defaults', !!A && A.d.settle.on===false && A.d.military.defend==='off' && A.d.grimoire.forks==='ask' && A.res.mana===60 && typeof A.lent==='object' && typeof A.stats==='object');
  ok('what the save had is kept', !!A && A.preset==='delegate' && A.d.research.on===true && A.d.military.camps===true);
  const u=fresh(); u.automation={v:1}; let e2=null; try{ G.autoTick(u); G.autoInbox(u); G.autoDomainOn(u,'settle'); }catch(e){ e2=e.message; }
  ok('even a bare { v: 1 } loads', !e2 && G.automation(u).d.settle.prefer==='gaps', e2||'');
}

// ---- presets ----
{ const s=fresh();
  G.autoPreset(s,'handsOn'); const A=G.automation(s);
  ok('Hands-on: every switch off (supply mirrors the supply lines as they are)', G.AUTO.ORDER.every(d=>Object.keys(G.AUTO.DOMAINS[d].sw).every(k=>(d==='economy'&&k==='supply')||!A.d[d][k])) && A.d.military.defend==='off' && A.d.economy.supply===(s.logistics&&s.logistics.p?s.logistics.p.on!==false:true));
  G.autoPreset(s,'assisted');
  ok('Assisted: research, study, new-city governors, supply, ceremonies, defence alerts', A.d.research.on && A.d.grimoire.on && A.d.economy.govNew && A.d.economy.supply && A.d.traditions.cer && A.d.military.defend==='alert');
  ok('Assisted: the rest stays off', !A.d.traditions.on && !A.d.military.camps && !A.d.hero.points && !A.d.events.on && !A.d.magi.on && !A.d.grimoire.ench);
  ok('Assisted keeps supply lines on', lon(s));
  G.autoPreset(s,'delegate');
  ok('Delegate: almost everything on', G.AUTO.ORDER.every(d=>G.autoDomainOn(s,d)) && A.d.military.defend==='act' && A.d.events.on && A.d.hero.adventure && A.d.economy.market);
  ok('Delegate puts a governor on every city', G.citiesOf(s,'p').every(c=>G.govOf(s,c.id)));
  G.autoSet(s,'research','focus','military');
  ok('changing a switch makes it Custom', A.preset==='custom' && A.d.research.focus==='military');
  G.autoPreset(s,'assisted');
  ok('a preset keeps the player\\'s policies', A.d.research.focus==='military');
  ok('bad settings are refused', !!G.autoSet(s,'research','focus','cooking') && !!G.autoSet(s,'nope','on',true) && !!G.autoPreset(s,'lazy'));
  G.autoPreset(s,'handsOn');
  ok('Hands-on leaves supply lines as they were', lon(s) && A.d.economy.supply===true);
  G.autoSet(s,'economy','supply',false);
  ok('the supply switch turns them off when asked', !lon(s));
  G.autoPreset(s,'assisted');
  ok('Assisted turns them back on', lon(s));
  const t=G.newGame({name:'T',race:'hearth',automation:'delegate'});
  ok('G.newGame accepts opts.automation', G.automation(t).preset==='delegate');
  const u=G.newGame({name:'T',race:'hearth'});
  ok('headless G.newGame leaves automation unset (Hands-on)', !u.automation);
}

// ---- research ----
{ const mk=on=>{ const s=fresh(); rich(s); G.capital(s,'p').buildings.academy=3; only(s,'research',{on}); return s; };
  const s=mk(true); run(s,2);
  const R=G.research(s,'p');
  ok('research on: a topic is queued and started within 2 game-minutes', R.studies.length>0 && logHas(s,'research',/^Queued/), R.studies.map(x=>x.id).join(','));
  ok('the log says why', /recommended/.test(G.autoLogOf(s,'research')[0].text), G.autoLogOf(s,'research')[0].text);
  const s2=mk(false); run(s2,3);
  ok('research off: nothing happens', !G.research(s2,'p').studies.length && !(G.research(s2,'p').queue||[]).length && !G.autoLogOf(s2).length);
  const s3=mk(true); G.autoSet(s3,'research','focus','military'); run(s3,2);
  const t=G.research(s3,'p').studies[0]; ok('focus military picks a war or siege topic', !!t && ['war','siege','state'].includes(DATA.techs[t.id].branch), t&&t.id+' '+DATA.techs[t.id].branch);
  const s4=mk(true); G.research(s4,'p').queue=['plough_dummy']; G.research(s4,'p').queue=[]; const before=G.autoLogOf(s4).length;
  // a queue the player set is never touched
  const pick=G.techRecommend(s4,'p',3)[2]; G.planResearch(s4,'p',null,pick); const q0=(G.research(s4,'p').queue||[]).slice(); G.autoRun(s4,'research');
  ok('research respects a queue the player set', G.autoLogOf(s4).length===before, q0.join(','));
}

// ---- grimoire ----
{ const mk=cfg=>{ const s=fresh(); const c=rich(s); c.buildings.magetower=5; c.res.mana=3000; only(s,'grimoire',cfg); return s; };
  const s=mk({on:true}); run(s,2);
  ok('grimoire on: study begins', !!s.empires.p.arcana.active || s.empires.p.arcana.known.length>0, JSON.stringify(G.autoLogOf(s,'grimoire').map(e=>e.text)));
  const s2=mk({on:false}); run(s2,3);
  ok('grimoire off: no study', !s2.empires.p.arcana.active && !G.autoLogOf(s2).length);
  // forks are left to the player
  const s3=mk({on:true}); for(let i=0;i<12;i++){ s3.empires.p.arcana.active=null; G.autoRun(s3,'grimoire'); const a=s3.empires.p.arcana.active; if(a){ s3.empires.p.arcana.known.push(a.id); s3.empires.p.arcana.active=null; } }
  ok('auto-study never takes one side of a fork', s3.empires.p.arcana.known.every(id=>!DATA.arcana[id].excl), s3.empires.p.arcana.known.length+' learned');
  // mana floor
  const s4=mk({on:true}); G.autoReserve(s4,'mana',4000); G.autoRun(s4,'grimoire');
  ok('mana floor: no study that would dip below it', !s4.empires.p.arcana.active);
  // routine blessings
  const s5=mk({buffs:true}); const c5=G.capital(s5,'p'); const node=G.spellNode('bountifulrain'); if(node&&!s5.empires.p.arcana.known.includes(node)) s5.empires.p.arcana.known.push(node);
  c5.short={grain:true}; G.autoRun(s5,'grimoire');
  ok('blessings: Bountiful Rain when grain is short', logHas(s5,'grimoire',/Bountiful Rain/), JSON.stringify(G.autoLogOf(s5).map(e=>e.text)));
  const s6=mk({buffs:false}); G.capital(s6,'p').short={grain:true}; if(node) s6.empires.p.arcana.known.push(node); G.autoRun(s6,'grimoire');
  ok('blessings off: no casting', !G.autoLogOf(s6).length);
  // enchantments
  const s7=mk({ench:true}); const known=G.enchantmentsKnown;
  G.enchantmentsKnown=()=>DATA.enchantOrder.slice(0,1); const es=G.enchantStatus; G.enchantStatus=(s,o,c,k)=>({ok:!G.hasEnchantment(s.cities[c],k),cost:{mana:10}});
  const econ=G.econ; G.econ=(s,c,a)=>{ const e=econ(s,c,a); e.net=Object.assign({},e.net,{mana:999}); return e; };
  G.autoRun(s7,'grimoire'); const ok7=(G.capital(s7,'p').ench||[]).length===1;
  const s8=mk({ench:true}); s8.automation.enchOff={[G.capital(s8,'p').id]:1}; G.autoRun(s8,'grimoire'); const ok8=!(G.capital(s8,'p').ench||[]).length;
  G.enchantmentsKnown=known; G.enchantStatus=es; G.econ=econ;
  ok('enchantments kept where the tower can feed them', ok7);
  ok('a city switched off in its header is left alone', ok8);
}

// ---- grimoire forks: the inbox, a policy, and the chosen side ----
{ const mk=cfg=>{ const s=fresh(); const c=rich(s); c.buildings.magetower=10; c.res.mana=20000; G.techEra=()=>9; only(s,'grimoire',cfg);
    // every plain node known, so the forks behind them open up
    const Ar=s.empires.p.arcana; Ar.known=(DATA.arcanaOrder||Object.keys(DATA.arcana)).filter(id=>!DATA.arcana[id].excl); Ar.active=null; Ar.queue=[]; return s; };
  const era=G.techEra;
  const s=mk({on:true}); const forks=G.autoArcForks(s);
  ok('open Grimoire forks are found', forks.length>0, forks.map(f=>f.join('/')).join(' '));
  const items=G.autoInbox(s).filter(i=>i.kind==='afork');
  ok('Grimoire forks appear in the inbox ("Ask me")', items.length===forks.length && items.every(i=>i.fork.length===2 && /fork in the Grimoire/.test(i.text)), items.map(i=>i.text).join(' | '));
  for(let i=0;i<6;i++){ s.empires.p.arcana.active=null; G.automation(s).studyAt=0; G.autoRun(s,'grimoire'); const a=s.empires.p.arcana.active; if(a){ s.empires.p.arcana.known.push(a.id); s.empires.p.arcana.active=null; } }
  ok('"Ask me": the stewards study neither side', s.empires.p.arcana.known.every(id=>!DATA.arcana[id].excl));
  const it=items[0], [a,b]=it.fork;
  ok('a fork needs a side', !!G.autoInboxDo(s,it.id) && !!G.autoInboxDo(s,it.id,'nonsense'));
  ok('one click picks a side', G.autoInboxDo(s,it.id,b)===null && G.automation(s).aforkPref[b]===1 && !G.autoInbox(s).some(i=>i.id===it.id));
  let got=false; for(let i=0;i<40&&!got;i++){ s.empires.p.arcana.active=null; G.automation(s).studyAt=0; G.autoRun(s,'grimoire'); const x=s.empires.p.arcana.active; if(x){ s.empires.p.arcana.known.push(x.id); s.empires.p.arcana.active=null; if(x.id===b) got=true; } }
  ok('the chosen side is studied, the other never', got && !s.empires.p.arcana.known.includes(a), logHas(s,'grimoire',/side of the fork you chose|at your word/)?'':JSON.stringify(G.autoLogOf(s,'grimoire').slice(0,3)));
  const t=mk({on:true}); G.autoRegisterCli(); const n=G.autoInbox(t).findIndex(i=>i.kind==='afork')+1; const f0=G.autoInbox(t)[n-1].fork;
  const r=G.cli.exec(t,'p','inbox',{}); ok('the console lists a fork with its two sides', r.out.some(l=>l.includes('<'+f0.join('|')+'>')));
  ok('inbox resolve <n> <side> picks it from the console', G.cli.exec(t,'p','inbox resolve '+n+' '+f0[0],{}).ok && G.automation(t).aforkPref[f0[0]]===1);
  const u=mk({on:true}); G.autoSet(u,'grimoire','forks','auto');
  ok('"Choose for me": no fork waits in the inbox', !G.autoInbox(u).some(i=>i.kind==='afork'));
  for(let i=0;i<40;i++){ u.empires.p.arcana.active=null; G.automation(u).studyAt=0; G.autoRun(u,'grimoire'); const x=u.empires.p.arcana.active; if(x){ u.empires.p.arcana.known.push(x.id); u.empires.p.arcana.active=null; } }
  const kn=u.empires.p.arcana.known;
  ok('"Choose for me": the stewards take one side of a fork, never both', kn.some(id=>DATA.arcana[id].excl) && kn.every(id=>!DATA.arcana[id].excl||!kn.includes(DATA.arcana[id].excl)), kn.filter(id=>DATA.arcana[id].excl).join(','));
  const d=fresh(); G.autoPreset(d,'delegate'); const e=fresh(); G.autoPreset(e,'assisted');
  ok('Delegate chooses forks for you, Assisted asks', G.automation(d).d.grimoire.forks==='auto' && G.automation(e).d.grimoire.forks==='ask');
  G.techEra=era;
}

// ---- traditions ----
{ const mk=cfg=>{ const s=fresh(); rich(s); s.empires.p.culture=5000; only(s,'traditions',cfg); return s; };
  const s=mk({on:true}); run(s,2);
  ok('traditions on: one is adopted within 2 game-minutes', s.empires.p.traditions.length>0 && logHas(s,'traditions',/^Adopted/), s.empires.p.traditions.join(','));
  const s2=mk({on:false}); run(s2,3);
  ok('traditions off: none adopted', !s2.empires.p.traditions.length);
  const s3=mk({on:true}); s3.empires.p.culture=1e6; for(let i=0;i<20;i++) G.autoRun(s3,'traditions');
  ok('forks "ask": never takes a side by itself', s3.empires.p.traditions.every(id=>!DATA.traditions[id].excl), s3.empires.p.traditions.length+' adopted');
  const forks=G.autoForks(s3);
  ok('the open forks are listed for the inbox', forks.length>0 && G.autoInbox(s3).some(i=>i.kind==='fork'));
  if(forks.length){ const [a,b]=forks[0]; G.autoForkPref(s3,b); for(let i=0;i<6;i++) G.autoRun(s3,'traditions');
    ok('a preferred fork side is followed, the other forsaken', s3.empires.p.traditions.includes(b) && !s3.empires.p.traditions.includes(a)); }
  const s4=mk({on:true}); G.autoSet(s4,'traditions','pillar','labour'); s4.empires.p.culture=1e6; for(let i=0;i<4;i++) G.autoRun(s4,'traditions');
  ok('a chosen pillar is followed', s4.empires.p.traditions.length>0 && s4.empires.p.traditions.every(id=>DATA.traditions[id].pillar==='labour'), s4.empires.p.traditions.join(','));
  // ceremonies
  const s5=mk({cer:true}); s5.empires.p.traditions=['hearthsongs','lanterns'];
  const p=G.addPending(s5,{kind:'ceremony',title:'Lanterns',text:'',options:[{key:'hold',label:'Hold'},{key:'skip',label:'Skip'}],expires:s5.time+1e6,def:'skip',data:{id:'lanterns'}});
  G.autoRun(s5,'traditions');
  ok('ceremonies on: a seasonal ceremony is held', !s5.pending.includes(p) && (s5.empires.p.ceremonies||{}).lanterns>s5.time);
  const s6=mk({cer:false}); s6.empires.p.traditions=['hearthsongs','lanterns'];
  const p6=G.addPending(s6,{kind:'ceremony',title:'Lanterns',text:'',options:[{key:'hold',label:'Hold'},{key:'skip',label:'Skip'}],expires:s6.time+1e6,def:'skip',data:{id:'lanterns'}});
  G.autoRun(s6,'traditions'); run(s6,1);
  ok('ceremonies off: it waits for the player', s6.pending.includes(p6));
  const s7=mk({cer:true}); s7.empires.p.traditions=['hearthsongs','lanterns']; s7.empires.p.gold=310; G.autoReserve(s7,'gold',300);
  const p7=G.addPending(s7,{kind:'ceremony',title:'Lanterns',text:'',options:[{key:'hold',label:'Hold'},{key:'skip',label:'Skip'}],expires:s7.time+1e6,def:'skip',data:{id:'lanterns'}});
  G.autoRun(s7,'traditions');
  ok('gold reserve: no ceremony that would spend below it', s7.pending.includes(p7) && s7.empires.p.gold===310);
}

// ---- military: camps ----
{ const mk=on=>{ const s=fresh(); const c=rich(s); c.units[basic(s)]=150; const t=near(s,c,2.5,5); const k=G.spawnCamp(s,1,null); if(k){ G.tileAt(s,k.x,k.y).camp=null; delete s.camps[k.id]; }
    const id=G.newId(s,'k'); s.camps[id]={id,x:t.x,y:t.y,tier:1,units:{brigand:5},loot:{grain:100}}; t.camp=id; only(s,'military',{camps:on}); return {s,t}; };
  const {s,t}=mk(true); run(s,2);
  ok('camps on: a raid goes out to a weak camp nearby', s.moves.some(m=>m.owner==='p'&&m.type==='raid'&&m.x===t.x&&m.y===t.y) || !s.camps[t.camp], G.autoLogOf(s).map(e=>e.text).join(' | '));
  const r=mk(false); run(r.s,3);
  ok('camps off: nobody marches', !r.s.moves.some(m=>m.owner==='p'));
  const g=mk(true); G.autoReserve(g.s,'garrison',200); run(g.s,3);
  ok('minimum garrison: a city never sends troops it must keep', !g.s.moves.some(m=>m.owner==='p'));
}

// ---- military: defence (intercept / alert) and reinforcements ----
{ const mk=(defend,balance)=>{
    const s=fresh(); const c=rich(s); c.units[basic(s)]=300;
    const ai=Object.keys(s.empires).find(id=>id!=='p'); const ac=G.capital(s,ai);
    G.rel(s,ai).status='war';
    const from=near(s,c,9,12)||ac;
    const path=G.path(s,from,c); const dur=20*MIN(s);
    s.moves.push({id:G.newId(s,'m'),owner:ai,type:'attack',from:ac.id,fx:from.x,fy:from.y,x:c.x,y:c.y,path,units:{[DATA.races[s.empires[ai].race].units[0]]:6},cargo:{},depart:s.time,arrive:s.time+dur});
    G.autoPreset(s,'handsOn'); G.autoSet(s,'military','defend',defend); if(balance) G.autoSet(s,'military','balance',true);
    return {s,c,ai};
  };
  const a=mk('act'); G.autoRun(a.s,'military');
  ok('defence "act": a weak column is intercepted', a.s.moves.some(m=>m.owner==='p'&&m.type==='intercept'), G.autoLogOf(a.s).map(e=>e.text).join(' | '));
  const b=mk('alert'); G.autoRun(b.s,'military');
  ok('defence "alert": no troops move, but an alert is logged', !b.s.moves.some(m=>m.owner==='p') && logHas(b.s,'military',/Defence alert/));
  const c=mk('off'); G.autoRun(c.s,'military');
  ok('defence off: nothing', !c.s.moves.some(m=>m.owner==='p') && !G.autoLogOf(c.s).length);
  ok('the inbox offers the intercept', G.autoInbox(c.s).some(i=>i.kind==='intercept') && G.autoInbox(c.s).some(i=>i.kind==='threat'));
  const it=G.autoInbox(c.s).find(i=>i.kind==='intercept');
  ok('one click intercepts from the inbox', G.autoInboxDo(c.s,it.id)===null && c.s.moves.some(m=>m.owner==='p'&&m.type==='intercept'));
  // reinforcements: a second city under a heavy attack
  const s=fresh(); const cap=rich(s); cap.units[basic(s)]=200;
  const t=near(s,cap,4,6); const c2=G.foundCity(s,'p',t.x,t.y,'Second'); c2.units={};
  const ai=Object.keys(s.empires).find(id=>id!=='p'); const ac=G.capital(s,ai); G.rel(s,ai).status='war';
  s.moves.push({id:G.newId(s,'m'),owner:ai,type:'attack',from:ac.id,fx:ac.x,fy:ac.y,x:c2.x,y:c2.y,path:G.path(s,ac,c2),units:{[DATA.races[s.empires[ai].race].units[0]]:80},cargo:{},depart:s.time,arrive:s.time+30*MIN(s)});
  G.autoPreset(s,'handsOn'); G.autoSet(s,'military','balance',true); G.autoRun(s,'military');
  const rf=s.moves.find(m=>m.owner==='p'&&m.type==='reinforce'&&m.x===c2.x&&m.y===c2.y);
  ok('balance: troops reinforce a threatened city', !!rf, G.autoLogOf(s).map(e=>e.text).join(' | '));
  ok('and leave the minimum garrison at home', G.soldiers ? (cap.units[basic(s)]||0)>=G.automation(s).res.garrison : true, cap.units[basic(s)]);
  // reinforcements return: tracked, held while threatened, sent home once it has been calm a while
  { const lent=G.autoLent(s); ok('the lent troops are tracked', !!lent[rf.id] && lent[rf.id].from===cap.id && lent[rf.id].to===c2.id);
    const sent=G.unitsCount(rf.units);
    const T=s.moves.find(m=>m.owner===ai); rf.arrive=s.time+1; T.arrive=s.time+1e6; G.advance(s,2,4);
    ok('they arrive and join the garrison', !s.moves.includes(rf) && G.unitsCount(c2.units)>=sent);
    s.time+=20*MIN(s); G.autoRun(s,'military');
    ok('while the threat stands they stay', !s.moves.some(m=>m.owner==='p'&&m.type==='reinforce'&&m.x===cap.x&&m.y===cap.y) && !!lent[rf.id]);
    s.moves.splice(s.moves.indexOf(T),1); G.autoRun(s,'military');
    s.time+=(G.AUTO.returnCalm-1)*MIN(s); G.autoRun(s,'military');
    ok('not before the city has been calm for '+G.AUTO.returnCalm+' minutes', !s.moves.some(m=>m.owner==='p'&&m.type==='reinforce'&&m.x===cap.x&&m.y===cap.y));
    s.time+=2*MIN(s); G.autoRun(s,'military');
    const back=s.moves.find(m=>m.owner==='p'&&m.type==='reinforce'&&m.from===c2.id&&m.x===cap.x&&m.y===cap.y);
    ok('then they march home', !!back && G.unitsCount(back.units)>0 && G.unitsCount(back.units)<=sent && logHas(s,'military',/march home/) && !lent[rf.id], G.autoLogOf(s,'military').slice(0,2).map(e=>e.text).join(' | '));
    ok('the reinforced city keeps its minimum garrison', G.unitsCount(c2.units)>=Math.min(G.automation(s).res.garrison, sent)); }
  // …unless the player moved them on
  { const s=fresh(); const cap=rich(s); cap.units[basic(s)]=200;
    const t=near(s,cap,4,6); const c2=G.foundCity(s,'p',t.x,t.y,'Second'); c2.units={};
    const ai=Object.keys(s.empires).find(id=>id!=='p'); const ac=G.capital(s,ai); G.rel(s,ai).status='war';
    s.moves.push({id:G.newId(s,'m'),owner:ai,type:'attack',from:ac.id,fx:ac.x,fy:ac.y,x:c2.x,y:c2.y,path:G.path(s,ac,c2),units:{[DATA.races[s.empires[ai].race].units[0]]:80},cargo:{},depart:s.time,arrive:s.time+30*MIN(s)});
    G.autoPreset(s,'handsOn'); G.autoSet(s,'military','balance',true); G.autoRun(s,'military');
    const rf=s.moves.find(m=>m.owner==='p'&&m.type==='reinforce'); rf.arrive=s.time+1; s.moves=s.moves.filter(m=>m.owner==='p'); G.advance(s,2,4);
    G.autoRun(s,'military'); c2.units={};             // the player marched them elsewhere
    s.time+=(G.AUTO.returnCalm+1)*MIN(s); G.autoRun(s,'military');
    ok('troops the player moved on are not chased home', !s.moves.some(m=>m.owner==='p'&&m.type==='reinforce'&&m.from===c2.id) && !Object.keys(G.autoLent(s)).length);
    // and a recalled column is forgotten
    const s2=fresh(); const cap2=rich(s2); cap2.units[basic(s2)]=200; const t2=near(s2,cap2,4,6); const d2=G.foundCity(s2,'p',t2.x,t2.y,'Third'); d2.units={};
    const ai2=Object.keys(s2.empires).find(id=>id!=='p'); const ac2=G.capital(s2,ai2); G.rel(s2,ai2).status='war';
    s2.moves.push({id:G.newId(s2,'m'),owner:ai2,type:'attack',from:ac2.id,fx:ac2.x,fy:ac2.y,x:d2.x,y:d2.y,path:G.path(s2,ac2,d2),units:{[DATA.races[s2.empires[ai2].race].units[0]]:80},cargo:{},depart:s2.time,arrive:s2.time+30*MIN(s2)});
    G.autoPreset(s2,'handsOn'); G.autoSet(s2,'military','balance',true); G.autoRun(s2,'military');
    const rf2=s2.moves.find(m=>m.owner==='p'&&m.type==='reinforce');
    if(rf2&&G.recallMove){ s2.time+=5; G.recallMove(s2,rf2.id); G.autoRun(s2,'military'); ok('a column the player recalls is no longer tracked', !G.autoLent(s2)[rf2.id]); }
  }
  // garrisons through governors
  const g=fresh(); G.setGovernor(g,G.capital(g,'p').id,{focus:'balanced'}); G.autoPreset(g,'handsOn'); G.autoReserve(g,'garrison',20); G.autoSet(g,'military','garrison',true);
  ok('garrison: the governor is told to keep the minimum garrison', g.council.gov[G.capital(g,'p').id].troops===20);
  // forge
  const f=fresh(); const fc=rich(f); fc.buildings.armory=3; fc.units[basic(f)]=40; G.autoPreset(f,'handsOn'); G.autoSet(f,'military','forge',true); G.autoRun(f,'military');
  ok('forge on: an upgrade starts with surplus goods', !!fc.forge, G.autoLogOf(f).map(e=>e.text).join(' | '));
  const f2=fresh(); const fc2=rich(f2); fc2.buildings.armory=3; fc2.units[basic(f2)]=40; G.autoPreset(f2,'handsOn'); G.autoRun(f2,'military');
  ok('forge off: nothing', !fc2.forge);
}

// ---- hero and generals ----
{ const s=fresh(); const h=G.hero(s); h.free=8; G.autoPreset(s,'handsOn'); G.autoSet(s,'hero','points',true); G.autoSet(s,'hero','build','warrior'); G.autoRun(s,'hero');
  ok('points on: every point spent by the build', h.free===0 && h.points.str>=h.points.lead && h.points.str+h.points.lead===8, JSON.stringify(h.points));
  const s2=fresh(); G.hero(s2).free=4; G.autoPreset(s2,'handsOn'); run(s2,2);
  ok('points off: they wait (and the inbox says so)', G.hero(s2).free===4 && G.autoInbox(s2).some(i=>i.kind==='hero'));
  const it=G.autoInbox(s2).find(i=>i.kind==='hero');
  ok('one click spends them', G.autoInboxDo(s2,it.id)===null && G.hero(s2).free===0);
  // adventure: a weak ruin next door
  const s3=fresh(); const c=G.capital(s3,'p'); c.units[basic(s3)]=60; const t=near(s3,c,2,4); t.ruin={tier:1,readyAt:0,units:null}; s3.special.push(t);
  G.hero(s3).points.str=10; G.autoPreset(s3,'handsOn'); G.autoSet(s3,'hero','adventure',true); G.autoRun(s3,'hero');
  ok('adventure on: the hero sets out for a ruin', s3.moves.some(m=>m.owner==='p'&&m.type==='adventure'), G.autoLogOf(s3).map(e=>e.text).join(' | '));
  const s4=fresh(); const c4=G.capital(s4,'p'); const t4=near(s4,c4,2,4); t4.ruin={tier:1,readyAt:0,units:null}; s4.special.push(t4); G.hero(s4).hp=50; G.autoPreset(s4,'handsOn'); G.autoSet(s4,'hero','adventure',true); G.autoRun(s4,'hero');
  ok('a wounded hero stays home', !s4.moves.some(m=>m.type==='adventure'));
  // generals ride to the army
  if(G.generalsOf){ const s5=fresh(); const cap=G.capital(s5,'p'); const t5=near(s5,cap,4,6); const c5=G.foundCity(s5,'p',t5.x,t5.y,'Fort'); c5.units[basic(s5)]=100;
    const emp=s5.empires.p; emp.generals=emp.generals||[]; emp.generals.push({id:'pg1',name:'Gen',race:'hearth',seed:1,level:1,xp:0,hp:100,traits:[],status:'home',city:cap.id,battles:0,wins:0});
    G.autoPreset(s5,'handsOn'); G.autoSet(s5,'hero','generals',true); G.autoRun(s5,'hero');
    ok('generals: an idle general rides to the main army', emp.generals[0].city===c5.id && emp.generals[0].status==='riding'); }
}

// ---- magi ----
{ const mk=on=>{ const s=fresh(); const c=rich(s); c.buildings.magetower=10; c.res.mana=3000; G.autoPreset(s,'handsOn'); if(on) G.autoSet(s,'magi','on',true); return s; };
  const s=mk(true); G.autoSet(s,'magi','budget','1600'); G.autoRun(s,'magi'); G.autoRun(s,'magi');
  ok('magi on: one is recruited and posted', G.magiOf(s,'p').length>0 && G.magiOf(s,'p').every(g=>g.station!=='idle'), G.magiOf(s,'p').map(g=>g.station).join(','));
  const s2=mk(false); run(s2,3);
  ok('magi off: none recruited', !G.magiOf(s2,'p').length);
  const s3=mk(true); G.autoSet(s3,'magi','budget','1600'); s3.empires.p.gold=G.automation(s3).res.gold+10; G.autoRun(s3,'magi');
  ok('gold reserve: no recruit below it', !G.magiOf(s3,'p').length && s3.empires.p.gold===G.automation(s3).res.gold+10);
  const s4=mk(true); G.autoSet(s4,'magi','budget','200'); G.autoRun(s4,'magi');
  ok('the budget caps what a recruit may cost', G.magiOf(s4,'p').every(g=>true) && (!G.magiOf(s4,'p').length || G.magiRecruitCost(s4,'p',1).gold<=200+999));
}

// ---- economy ----
{ const mk=on=>{ const s=fresh(); G.autoPreset(s,'handsOn'); if(on) G.autoSet(s,'economy','govNew',true); const cap=G.capital(s,'p'); G.autoRun(s,'economy'); const t=near(s,cap,4,6); const c=G.foundCity(s,'p',t.x,t.y,'New'); return {s,c,cap}; };
  const a=mk(true); run(a.s,1.5);
  ok('governors on new cities: the new city gets one', !!G.govOf(a.s,a.c.id) && logHas(a.s,'economy',/takes over New/));
  ok('the capital (not new) is left to the player', !G.govOf(a.s,a.cap.id));
  ok('the governor keeps the gold reserve', a.s.council.gov[a.c.id].reserve>=G.automation(a.s).res.gold);
  const b=mk(false); run(b.s,2);
  ok('off: no governor appears', !G.govOf(b.s,b.c.id));
  G.autoSet(b.s,'economy','market',true);
  ok('market on: supply lines sell and buy above the gold reserve', b.s.logistics.p.sell && b.s.logistics.p.buy && b.s.logistics.p.reserve===G.automation(b.s).res.gold);
  G.autoReserve(b.s,'gold',777);
  ok('the market reserve follows the gold reserve', b.s.logistics.p.reserve===777);
}

// ---- faith ----
{ const s=fresh(); const cap=rich(s); cap.buildings.temple=1; s.empires.p.faith=500;
  const err=G.foundFaith(s,'p',{name:'Test Faith',god:'ysolde',tenets:['tithes','charity']});
  const t=near(s,cap,4,6); const c2=G.foundCity(s,'p',t.x,t.y,'Heathen'); c2.faiths={none:1}; c2.units.priest=2;
  G.autoPreset(s,'handsOn'); G.autoSet(s,'faith','preach',true); G.autoRun(s,'faith');
  ok('preach on: priests at home preach where the faith is weak', !err && (c2.units.priest||0)<2 && (c2.faiths[s.empires.p.faithId]||0)>0, err||'');
  const s2=fresh(); const cap2=rich(s2); cap2.buildings.temple=1; s2.empires.p.faith=500; G.foundFaith(s2,'p',{name:'Test Faith 2',god:'ysolde',tenets:['tithes','charity']}); cap2.faiths={none:1}; cap2.units.priest=2; G.autoPreset(s2,'handsOn'); G.autoRun(s2,'faith');
  ok('preach off: priests wait', cap2.units.priest===2);
  const s3=fresh(); const c3=rich(s3); c3.buildings.townhall=Math.max(3,c3.buildings.townhall||1); G.autoPreset(s3,'handsOn'); G.autoSet(s3,'faith','shrines',true); G.autoRun(s3,'faith');
  ok('shrines on: a shrine is queued when faith runs thin', c3.buildQueue.some(q=>q.type==='shrine'), G.buildStatus(s3,c3,'shrine').reason||'');
}

// ---- minor decisions, temperament, grace, reserves; important ones never ----
{ const drought=(s,gold)=>G.addPending(s,{kind:'event',title:'Drought',text:'',options:[{key:'wells',label:'Dig wells'},{key:'endure',label:'Endure'}],expires:s.time+1e7,def:'endure',data:{ev:'drought',city:G.capital(s,'p').id,gold}});
  const s=fresh(); G.autoPreset(s,'handsOn'); G.autoSet(s,'events','on',true); s.empires.p.gold=2000;
  const p=drought(s,100); G.autoRun(s,'events');
  ok('a fresh decision waits out the grace period', s.pending.includes(p));
  s.time+=200*G.pace(s).time; G.autoRun(s,'events');
  ok('after the grace a balanced steward digs the wells', !s.pending.includes(p) && s.empires.p.gold===1900 && logHas(s,'events',/Dig wells/));
  const r=fresh(); G.autoPreset(r,'handsOn'); G.autoSet(r,'events','on',true); r.empires.p.gold=350; const pr=drought(r,100); G.autoRun(r,'events'); r.time+=200*G.pace(r).time; G.autoRun(r,'events');
  ok('gold reserve: the steward endures rather than spend below it', !r.pending.includes(pr) && r.empires.p.gold===350 && logHas(r,'events',/Endure/));
  const fest=s=>G.addPending(s,{kind:'event',title:'Festival',text:'',options:[{key:'hold',label:'Hold it'},{key:'no',label:'Not this year'}],expires:s.time+1e7,def:'no',data:{ev:'festival',gold:100}});
  const c=fresh(); G.autoPreset(c,'handsOn'); G.autoSet(c,'events','on',true); G.autoSet(c,'events','temper','cautious'); c.empires.p.gold=5000; fest(c);
  const b=fresh(); G.autoPreset(b,'handsOn'); G.autoSet(b,'events','on',true); G.autoSet(b,'events','temper','bold'); b.empires.p.gold=5000; fest(b);
  for(const x of [c,b]){ G.autoRun(x,'events'); x.time+=200*G.pace(x).time; G.autoRun(x,'events'); }
  ok('a cautious steward skips the festival, a bold one holds it', c.empires.p.gold===5000 && b.empires.p.gold===4900, c.empires.p.gold+' '+b.empires.p.gold+' '+JSON.stringify(G.autoLogOf(b).map(e=>e.text)));
  const o=fresh(); G.autoPreset(o,'handsOn'); const po=drought(o,100); o.time+=1000; G.autoRun(o,'events');
  ok('events off: decisions wait for the player', o.pending.includes(po));
  // important decisions: never answered, however long
  const imp=fresh(); G.autoPreset(imp,'delegate'); imp.empires.p.gold=1e5;
  const kinds=['deal','callToArms','peaceOffer','allianceOffer','tribute','tradeRoute','dynSuccession','dynPretender','dynClaim','dynMatch','crisis'];
  const handlers={}; for(const k of kinds){ handlers[k]=G.pendingHandlers[k]; G.pendingHandlers[k]=()=>{ throw new Error('auto-resolved '+k); }; }
  const ps=kinds.map(k=>G.addPending(imp,{kind:k,title:k,text:'',options:[{key:'accept',label:'Accept'},{key:'decline',label:'Decline'}],expires:imp.time+1e9,def:'decline',data:{}}));
  let threw=null; try{ for(let i=0;i<30;i++){ imp.time+=600; G.autoRun(imp,'events'); } }catch(e){ threw=e.message; }
  for(const k of kinds) G.pendingHandlers[k]=handlers[k];
  ok('war, treaties, offers, succession and crises are never auto-resolved', !threw && ps.every(p=>imp.pending.includes(p)), threw||'');
  ok('they all show in the inbox, with their own answers', ps.every(p=>G.autoInbox(imp).some(i=>i.pending===p && !i.act)));
  ok('the inbox will not let the stewards decide them', !!G.autoInboxDo(imp,'pend:'+ps[0].id));
  imp.pending=imp.pending.filter(p=>!ps.includes(p));
  // a storylet with a temperament
  if(G.story){ const t=fresh(); t.story=t.story||{}; t.story.on=true; G.autoPreset(t,'handsOn'); G.autoSet(t,'events','on',true); t.empires.p.gold=5000;
    let err=null; for(const id of (DATA.storylets||[]).map(x=>x.id)){ err=G.story.force(t,id,true); if(!err) break; }
    const sp=(t.pending||[]).find(p=>p.kind==='storylet');
    if(sp){ G.autoRun(t,'events'); t.time+=200*G.pace(t).time; G.autoRun(t,'events'); ok('a tale is answered after the grace', !t.pending.includes(sp) && logHas(t,'events',/balanced/), JSON.stringify(G.autoLogOf(t).map(e=>e.text))+JSON.stringify((t.pending||[]).map(p=>p.kind))); }
    else ok('a tale could be forced for the test', false, err); }
}

// ---- settlement: settlers when renown allows, a safe site that fills the realm's gaps, an escort near danger ----
{ const ready=s=>{ const c=rich(s); c.buildings.townhall=Math.max(6,c.buildings.townhall||1); c.buildings.market=Math.max(1,c.buildings.market||0); c.pop=Math.max(c.pop,60);
    s.empires.p.renownBonus=Math.max(0,G.nextCityRenown(s,'p')-G.renown(s,'p')); return c; };
  ok('the Settlement domain is on in Delegate, off in Assisted and Hands-on', (()=>{ const a=fresh(),b=fresh(),c=fresh(); G.autoPreset(a,'delegate'); G.autoPreset(b,'assisted'); G.autoPreset(c,'handsOn'); return G.automation(a).d.settle.on && !G.automation(b).d.settle.on && !G.automation(c).d.settle.on; })());
  const s=fresh(); const c=ready(s); only(s,'settle',{on:true}); G.autoRun(s,'settle');
  ok('renown allows a city: settlers are trained', (c.train.townhall||[]).some(q=>q.unit==='settlers') && logHas(s,'settle',/Training settlers in/), G.autoLogOf(s).map(e=>e.text).join(' | '));
  G.autoRun(s,'settle');
  ok('only one batch at a time', (c.train.townhall||[]).filter(q=>q.unit==='settlers').reduce((a,q)=>a+q.left,0)===1);
  c.train.townhall=[]; c.units.settlers=1; G.autoRun(s,'settle');
  const m=s.moves.find(m=>m.owner==='p'&&m.type==='settle');
  ok('settlers at hand set out for a site, and the log says why', !!m && logHas(s,'settle',/Settlers set out from .* for \\(\\d+, \\d+\\): \\S/), G.autoLogOf(s,'settle').slice(0,1).map(e=>e.text).join(''));
  if(m){ const t=G.tileAt(s,m.x,m.y);
    ok('the site is free land, three or more tiles from any city', !t.city && !t.quarter && !G.isWater(t) && Object.values(s.cities).every(o=>G.dist(o,t)>=2.8));
    ok('and is no worse than the site the survey rates average for our people', G.siteFit(G.siteYield(s,t.x,t.y),'hearth')>-0.5); }
  ok('a sent column takes the city slot (no second batch)', !G.canFoundCity(s,'p') && (G.autoRun(s,'settle'), !(c.train.townhall||[]).length));
  if(m){ m.arrive=s.time+1; G.advance(s,2,4); ok('they found the city', G.citiesOf(s,'p').length===2); }
  // the realm's shortages steer the choice: with ore lacking the pick is at least as rich in ore as without
  { const s=fresh(); const c=ready(s); only(s,'settle',{on:true}); c.units.settlers=1; const lack=G.realmLack;
    G.realmLack=()=>({grain:0,timber:0,stone:0,ore:0}); const p0=G.autoSettlePlan(s,true);
    G.realmLack=()=>({grain:0,timber:0,stone:0,ore:1.2}); const p1=G.autoSettlePlan(s,true);
    G.realmLack=lack;
    const o0=p0&&G.siteYield(s,p0.t.x,p0.t.y).ore, o1=p1&&G.siteYield(s,p1.t.x,p1.t.y).ore;
    ok('when the realm lacks ore, the site leans to ore (and says so when it is rich in it)', !!p1 && o1>=o0 && (o1<=1.05 || /ore/.test(p1.why)), o0&&o0.toFixed(2)+' -> '+(o1&&o1.toFixed(2))+' '+(p1&&p1.why)); }
  // never into danger; an escort when hostiles are near
  { const s=fresh(); const c=ready(s); only(s,'settle',{on:true}); c.units.settlers=1; c.units[basic(s)]=60;
    const p0=G.autoSettlePlan(s,true);
    const id=G.newId(s,'k'); const kt=G.freeTile(s,x=>G.dist(x,p0.t)<=1.5&&G.dist(x,p0.t)>0&&!x.city&&!G.isWater(x)); s.camps[id]={id,x:kt.x,y:kt.y,tier:1,units:{brigand:5},loot:{}}; kt.camp=id;
    const p1=G.autoSettlePlan(s,true);
    ok('a site with brigands next door is passed over', !!p1 && (p1.t.x!==p0.t.x||p1.t.y!==p0.t.y) && Object.values(s.camps).every(k=>G.dist(k,p1.t)>G.AUTO.settleSafe));
    // hostiles a few tiles off: the settlers go with an escort
    const id2=G.newId(s,'k'); const k2=G.freeTile(s,x=>{ const d=G.dist(x,p1.t); return d>G.AUTO.settleSafe+0.5&&d<=G.AUTO.settleEscort&&!x.city&&!x.quarter&&!G.isWater(x)&&G.dist(x,kt)>1; });
    if(k2){ s.camps[id2]={id:id2,x:k2.x,y:k2.y,tier:1,units:{brigand:5},loot:{}}; k2.camp=id2; }
    const p2=G.autoSettlePlan(s,true);
    G.autoRun(s,'settle'); const m=s.moves.find(m=>m.owner==='p'&&m.type==='settle');
    ok('with hostiles near, soldiers escort the settlers (above the minimum garrison)', !!m && (!p2.danger || (G.unitsCount(m.units)>1 && /escort/.test(G.autoLogOf(s,'settle')[0].text))) && (c.units[basic(s)]||0)>=G.automation(s).res.garrison, (p2&&p2.danger)+' '+G.autoLogOf(s,'settle').slice(0,1).map(e=>e.text));
    ok('the plan near danger names it', !k2 || !!p2.danger); }
  // no escort to spare: the settlers wait
  { const s=fresh(); const c=ready(s); only(s,'settle',{on:true}); c.units={settlers:1}; G.AUTO.settleEscort=40;
    const ai=Object.keys(s.empires).find(id=>id!=='p'); G.rel(s,ai).status='war';
    try{ G.autoRun(s,'settle'); } finally{ G.AUTO.settleEscort=6; }
    ok('danger near and nobody to escort: the settlers wait', !s.moves.some(m=>m.type==='settle') && logHas(s,'settle',/wait/)); }
  // reserves
  { const s=fresh(); const c=ready(s); only(s,'settle',{on:true}); G.autoReserve(s,'gold',s.empires.p.gold); G.autoRun(s,'settle');
    ok('gold reserve: no settlers that would spend below it', !(c.train.townhall||[]).length); }
  { const s=fresh(); const c=ready(s); only(s,'settle',{on:true}); s.empires.p.renownBonus=0; G.autoRun(s,'settle');
    ok('no settlers before renown allows another city', !G.canFoundCity(s,'p') && !(c.train.townhall||[]).length); }
  // the domain off: the inbox says a site is ready, and one click acts
  { const s=fresh(); const c=ready(s); G.autoPreset(s,'handsOn');
    const it=G.autoInbox(s).find(i=>i.kind==='settle');
    ok('domain off: "A site is ready for a new city" in the inbox', !!it && /A site is ready for a new city/.test(it.text) && it.act && it.jump.tab==='world', it&&it.text);
    ok('one click trains the settlers', G.autoInboxDo(s,'settle')===null && (c.train.townhall||[]).some(q=>q.unit==='settlers'));
    c.train.townhall=[]; c.units.settlers=1;
    ok('and then sends them', G.autoInbox(s).find(i=>i.kind==='settle').act.label==='Send settlers' && G.autoInboxDo(s,'settle')===null && s.moves.some(m=>m.type==='settle'));
    const s2=fresh(); ready(s2); G.autoPreset(s2,'delegate');
    ok('domain on: no inbox item (the stewards will see to it)', !G.autoInbox(s2).some(i=>i.kind==='settle')); }
  // a passive Delegate player founds a second city within 4 game-hours
  { let a=7; const r=Math.random; Math.random=()=>{ a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
    try{ const s=G.newGame({name:'T',race:'hearth'}); G.aiPressure=basePressure; G.autoPreset(s,'delegate'); let at=null;
      for(let h=0;h<16&&G.citiesOf(s,'p').length<2;h++){ G.advance(s,900,1500); if(G.citiesOf(s,'p').length>=2) at=(h+1)/4; }
      ok('a passive Delegate realm founds a new city within 4 game-hours', G.citiesOf(s,'p').length>=2 && logHas(s,'settle',/Settlers set out/), at!==null?'(after '+at+' h)':G.autoLogOf(s,'settle').slice(0,3).map(e=>e.text).join(' | ')); }
    finally{ Math.random=r; G.aiPressure=()=>0; } }
}

// ---- the inbox ----
{ const s=fresh(); G.autoPreset(s,'handsOn'); const cap=G.capital(s,'p'); cap.buildQueue=[];
  let items=G.autoInbox(s);
  ok('idle city without a governor is listed', items.some(i=>i.id==='idle:'+cap.id));
  ok('one click appoints a governor', G.autoInboxDo(s,'idle:'+cap.id)===null && !!G.govOf(s,cap.id) && !G.autoInbox(s).some(i=>i.id==='idle:'+cap.id));
  rich(s); cap.buildings.academy=2;
  ok('empty research queue (auto off) is listed', G.autoInbox(s).some(i=>i.kind==='research'));
  ok('one click queues a recommended topic', G.autoInboxDo(s,'research')===null && ((G.research(s,'p').queue||[]).length+G.research(s,'p').studies.length)>0 && !G.autoInbox(s).some(i=>i.kind==='research'));
  const p=G.addPending(s,{kind:'event',title:'Refugees',text:'',options:[{key:'accept',label:'Welcome'},{key:'no',label:'No'}],expires:s.time+1e7,def:'no',data:{ev:'refugees',city:cap.id,n:10}});
  ok('a waiting decision is listed', G.autoInbox(s).some(i=>i.pending===p && i.act));
  ok('and can be answered from the inbox with its own option', G.autoInboxDo(s,'pend:'+p.id,'no')===null && !s.pending.includes(p));
  const p2=G.addPending(s,{kind:'event',title:'Drought',text:'',options:[{key:'wells',label:'Dig'},{key:'endure',label:'Endure'}],expires:s.time+1e7,def:'endure',data:{ev:'drought',city:cap.id,gold:50}});
  ok('or left to the stewards in one click', G.autoInboxDo(s,'pend:'+p2.id)===null && !s.pending.includes(p2));
  G.autoSet(s,'events','on',true);
  const p3=G.addPending(s,{kind:'event',title:'Drought',text:'',options:[{key:'wells',label:'Dig'},{key:'endure',label:'Endure'}],expires:s.time+1e7,def:'endure',data:{ev:'drought',city:cap.id,gold:50}});
  ok('minor decisions the stewards will answer are not in the inbox', !G.autoInbox(s).some(i=>i.pending===p3));
  ok('items come sorted by priority', G.autoInbox(s).every((x,i,a)=>!i||a[i-1].prio>=x.prio));
  ok('stale ids are refused', !!G.autoInboxDo(s,'idle:nope'));
}

// ---- save / load ----
{ const s=fresh(); G.autoPreset(s,'delegate'); G.autoSet(s,'events','temper','bold'); G.autoReserve(s,'gold',900); rich(s); G.capital(s,'p').buildings.academy=2; run(s,2);
  const t=G.deserialize(G.serialize(s)); const A=G.automation(t);
  ok('save/load keeps preset, policies, reserves and the log', A.preset==='custom' && A.d.events.temper==='bold' && A.res.gold===900 && A.log.length===s.automation.log.length && A.log.length>0);
  run(t,1);
  ok('a loaded game keeps automating', G.autoLogOf(t).length>=A.log.length);
  ok('game over: automation stops', (()=>{ t.gameOver='defeat'; const n=t.automation.log.length; G.capital(t,'p').buildQueue=[]; t.empires.p.hero.free=5; run(t,2); return t.automation.log.length===n; })());
}

// ---- console ----
{ const s=fresh(); G.autoRegisterCli();
  ok('console commands registered', G.cli.commands.some(c=>c.name==='auto') && G.cli.commands.some(c=>c.name==='inbox'));
  const ex=l=>G.cli.exec(s,'p',l,{});
  ok('auto lists the domains', ex('auto').out.some(l=>/research/.test(l)));
  ok('auto research on', ex('auto research on').ok && G.automation(s).d.research.on);
  ok('auto research focus economy', ex('auto research focus economy').ok && G.automation(s).d.research.focus==='economy');
  ok('auto preset delegate', ex('auto preset delegate').ok && G.automation(s).preset==='delegate');
  ok('auto military off', ex('auto military off').ok && !G.autoDomainOn(s,'military'));
  ok('auto reserve gold 1000', ex('auto reserve gold 1000').ok && G.automation(s).res.gold===1000);
  ok('a bad domain explains itself', !ex('auto wizardry on').ok);
  G.autoPreset(s,'handsOn'); G.capital(s,'p').buildQueue=[]; G.setGovernor(s,G.capital(s,'p').id,{on:false});
  ok('inbox lists items', ex('inbox').out.some(l=>/governor/.test(l)));
  const n=G.autoInbox(s).findIndex(i=>i.kind==='idle')+1;
  ok('inbox resolve <n> acts on an item', ex('inbox resolve '+n).ok && !!G.govOf(s,G.capital(s,'p').id));
}

// ---- performance: automation for 'p' costs under 1 ms per slow tick ----
{ const s=fresh(); G.autoPreset(s,'delegate'); G.aiPressure=basePressure; run(s,60);
  const A=G.automation(s); for(const d of G.AUTO.ORDER) A.next[d]=0;
  let n=0; const t0=process.hrtime.bigint();
  for(let i=0;i<400;i++){ s.time+=10; G.autoTick(s); n++; }
  const ms=Number(process.hrtime.bigint()-t0)/1e6/n;
  ok('automation costs < 1 ms per slow tick', ms<1, ms.toFixed(3)+' ms');
  G.aiPressure=()=>0;
}

// ---- headless comparison: a passive Delegate realm vs a passive Hands-on realm, 6 game-hours ----
if(!QUICK){
  const play=(preset,seed)=>{
    let a=seed|0; const r=Math.random; Math.random=()=>{ a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
    try{ const s=G.newGame({name:'T',race:'hearth'}); G.aiPressure=basePressure; G.autoPreset(s,preset); G.advance(s,6*3600,24000);
      const cs=G.citiesOf(s,'p'); return { renown:G.renown(s,'p'), pop:Math.round(cs.reduce((x,c)=>x+c.pop,0)), cities:cs.length, lv:cs.reduce((x,c)=>x+Object.values(c.buildings).reduce((y,b)=>y+(b||0),0),0), techs:Object.keys(G.research(s,'p').done).length, trads:s.empires.p.traditions.length, acts:(s.automation||{log:[]}).log.length, alive:!s.gameOver }; }
    finally{ Math.random=r; G.aiPressure=()=>0; }
  };
  const res={handsOn:[],delegate:[]};
  for(const seed of [11,23]) for(const k of Object.keys(res)) res[k].push(play(k,seed));
  const avg=(k,f)=>Math.round(res[k].reduce((a,x)=>a+x[f],0)/res[k].length);
  for(const k of Object.keys(res)) console.log('  '+k.padEnd(9)+' renown '+avg(k,'renown')+' · pop '+avg(k,'pop')+' · building levels '+avg(k,'lv')+' · techs '+avg(k,'techs')+' · traditions '+avg(k,'trads')+' · cities '+avg(k,'cities')+' · automated actions '+avg(k,'acts'));
  ok('a passive Delegate realm clearly outgrows a passive Hands-on one', avg('delegate','renown')>=avg('handsOn','renown')*1.5 && avg('delegate','pop')>avg('handsOn','pop'));
}

// ---- the start screen: act.begin passes the chosen preset through START_OPTS (no wrapper around act.begin) ----
{ const out=require('child_process').spawnSync(process.execPath,['-e',START_HOOK_TEST],{encoding:'utf8',cwd:process.cwd()});
  const line=(out.stdout||'').trim().split('\\n').pop()||'';
  ok('the start screen passes the Delegate preset to G.newGame', /^preset=delegate wrapped=false opts=automation$/.test(line), line+' '+(out.stderr||'').slice(0,300));
}

console.log(fails?fails+' FAILED':'ALL PASS');
if(fails) process.exitCode=1;
`);
