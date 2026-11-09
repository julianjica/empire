// The Grimoire: tree integrity, study and its queue, costs, foreign schools, mastery, metamagic,
// enchantments and their upkeep, the celestial calendar, every spell's effect, AI study, old saves.
// node tests/arcana.js
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/roads.js','js/intercept.js','js/dynasty.js','js/portraits.js','js/portrait-people.js','js/portrait-gear.js'].filter(f=>fs.existsSync(f));
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
let fails=0;
const ok=(name,cond,extra)=>{ if(!cond) fails++; console.log((cond?'PASS ':'FAIL ')+name+(extra!==undefined?' '+extra:'')); };
const quiet=s=>{ s.settings.hostility=0; s.calamityAt=1e12; s.eventAt=1e12; G.aiPressure=()=>0; };
const fresh=(race='hearth')=>{ const s=G.newGame({name:'T',race}); quiet(s); return s; };
const N=DATA.arcana, A=(s,o='p')=>G.grimoire(s,o);
const era=(s,o,n)=>{ const R=G.research(s,o); for(const [id,t] of Object.entries(DATA.techs)) if(t.era<n) R.done[id]=true; };
const rich=(c,s)=>{ c.res.mana=1e5; c.res.tools=5000; c.res.iron=5000; s.empires[c.owner].gold=1e6; };
const learnAll=(s,o,pred)=>{ for(const id of DATA.arcanaOrder) if(!pred||pred(N[id])) { const a=A(s,o); if(!a.known.includes(id)&&!(N[id].excl&&a.known.includes(N[id].excl))) a.known=[...a.known,id]; } };
const near=(s,c,lo,hi)=>G.freeTile(s,x=>G.dist(x,c)>=lo&&G.dist(x,c)<=hi&&G.landReachable(s,c,x));

// ---- the tree ----
{ const ids=DATA.arcanaOrder;
  ok('the Grimoire has a Foundations trunk of 12-17 nodes', (()=>{ const n=ids.filter(i=>!N[i].school).length; return n>=12&&n<=17; })(), ids.filter(i=>!N[i].school).length);
  const per=DATA.schoolOrder.map(k=>[k,ids.filter(i=>N[i].school===k).length, ids.filter(i=>N[i].school===k).reduce((a,i)=>a+N[i].spells.length,0)]);
  ok('every school has 11-13 nodes', per.every(p=>p[1]>=11&&p[1]<=13), JSON.stringify(per));
  ok('every school has 6-8 spells', per.every(p=>p[2]>=6&&p[2]<=8));
  ok('four circles, three tiers each (cols 0..11)', ids.every(i=>N[i].circle>=0&&N[i].circle<=3&&N[i].tier>=0&&N[i].tier<=2&&N[i].col===N[i].circle*3+N[i].tier));
  ok('every prerequisite exists', ids.every(i=>N[i].pre.every(g=>g.length&&g.every(x=>N[x]))));
  ok('prerequisites always lie in an earlier column', ids.every(i=>N[i].pre.every(g=>g.every(x=>N[x].col<N[i].col))));
  // no cycles (follow every edge)
  const state={}; let cyc=false;
  const dfs=i=>{ if(state[i]===1){cyc=true;return;} if(state[i]===2) return; state[i]=1; for(const g of N[i].pre) for(const x of g) dfs(x); state[i]=2; };
  ids.forEach(dfs); ok('no cycles', !cyc);
  const placed={}; for(const i of ids) for(const sp of N[i].spells) placed[sp]=(placed[sp]||0)+1;
  ok('every spell sits in the tree exactly once', Object.keys(DATA.spells).every(id=>placed[id]===1), Object.keys(DATA.spells).filter(id=>placed[id]!==1).join(','));
  ok('school spells sit in their own school tree', ids.every(i=>N[i].spells.every(sp=>!DATA.spells[sp].school||DATA.spells[sp].school===N[i].school)));
  ok('a circle\\'s tower gate covers the tier of its spells', ids.every(i=>N[i].spells.every(sp=>DATA.spells[sp].tier<=DATA.circles[N[i].circle].tower)));
  const forks=ids.filter(i=>N[i].excl);
  ok('forks are mirrored pairs in the same school', forks.length>=10 && forks.every(i=>N[N[i].excl].excl===i && N[N[i].excl].school===N[i].school), forks.length);
  ok('node kinds: spell, lore, meta, ench', ids.every(i=>['spell','lore','meta','ench'].includes(N[i].kind)) && ['spell','lore','meta','ench'].every(k=>ids.some(i=>N[i].kind===k)));
  ok('all four metamagics are in the trunk', DATA.metaOrder.every(m=>ids.some(i=>N[i].meta===m&&!N[i].school)));
  ok('every enchantment is taught by a node', DATA.enchantOrder.every(e=>ids.some(i=>N[i].ench.includes(e))));
  ok('one enchantment per school', DATA.schoolOrder.every(k=>DATA.enchantOrder.filter(e=>DATA.enchantments[e].school===k).length===1));
  ok('cross-links name real techs and traditions', ids.every(i=>(!N[i].tech||DATA.techs[N[i].tech])&&(!N[i].techOff||DATA.techs[N[i].techOff])&&(!N[i].trad||DATA.traditions[N[i].trad])));
  ok('every spell is reachable from the roots', (()=>{ const s=fresh(); const a=A(s); const got=new Set(a.known); let grew=true; while(grew){ grew=false; for(const i of ids) if(!got.has(i)&&N[i].pre.every(g=>g.some(x=>got.has(x)))){ got.add(i); grew=true; } } return Object.keys(DATA.spells).every(sp=>got.has(G.spellNode(sp))); })());
  ok('effects text for every node', ids.every(i=>G.arcanaFxText(i).length>5));
  ok('new spells have distinct mechanics (most run their own code)', Object.values(DATA.spells).filter(sp=>sp.run).length>=30, Object.values(DATA.spells).filter(sp=>sp.run).length);
}

// ---- seeds: a new realm knows its trunk roots and its native first spell ----
{ const s=fresh(); const sp=G.spellsOf(s,'p');
  ok('a new realm knows Arcane Theory and the native seed spell', sp.includes('scry')&&sp.includes('bountifulrain'));
  ok('…the Rites of the Land are innate (Mage Tower 15 to cast)', sp.includes('growforest')&&sp.includes('raiseland'));
  ok('…but not the rest of its school', !sp.includes('hearthward')&&!sp.includes('summersun'));
  ok('…nor foreign schools', !sp.includes('emberstorm')&&G.schoolsOf(s,'p').join()==='hearthweather');
  ok('every AI realm has a grimoire with its own seed', Object.values(s.empires).filter(e=>e.id!=='p').every(e=>e.arcana&&e.arcana.known.some(i=>N[i].seed&&DATA.schools[N[i].school].race===e.race)));
  const c=G.capital(s,'p'); c.buildings.magetower=5; c.res.mana=1000;
  ok('an unlearned spell is hidden with a reason', G.spellStatus(s,'p',c.id,'hearthward').hidden && /study/i.test(G.spellStatus(s,'p',c.id,'hearthward').reason), G.spellStatus(s,'p',c.id,'hearthward').reason);
  ok('casting an unlearned spell is refused', !!G.castSpell(s,'p',c.id,'hearthward',c.id));
}

// ---- study: gates, cost, time, completion, refund ----
{ const s=fresh(); const c=G.capital(s,'p'); rich(c,s);
  ok('no tower: the Apprentice circle is closed', /Mage Tower 1/.test(G.arcanaStatus(s,'p','he_lore').reason||''), G.arcanaStatus(s,'p','he_lore').reason);
  c.buildings.magetower=1;
  ok('tower 1: Apprentice lore can be studied', G.arcanaStatus(s,'p','he_lore').ok);
  learnAll(s,'p',n=>n.school==='hearthweather'&&n.circle===0);
  ok('Adept needs a Mage Tower 5', /Mage Tower 5/.test(G.arcanaStatus(s,'p','he_c').reason||''), G.arcanaStatus(s,'p','he_c').reason);
  c.buildings.magetower=5;
  ok('Adept needs the Kingdom era too', /Kingdom era/.test(G.arcanaStatus(s,'p','he_c').reason||''), G.arcanaStatus(s,'p','he_c').reason);
  era(s,'p',1);
  ok('in the Kingdom era with tower 5 Adept opens', G.arcanaStatus(s,'p','he_c').ok, G.arcanaStatus(s,'p','he_c').reason);
  ok('a research link gates a node (Ward of Weaving needs Wards)', (()=>{ G.research(s,'p').done.wards=false; delete G.research(s,'p').done.wards; const r=G.arcanaStatus(s,'p','f_ward'); G.research(s,'p').done.wards=true; return r.tech && G.arcanaStatus(s,'p','f_ward').ok; })());
  const cost=G.arcanaCost(s,'p','he_c');
  ok('study costs mana and gold', cost.mana>0&&cost.gold>0&&!cost.tools);
  ok('later circles add tools and iron', G.arcanaCost(s,'p','he_e').tools>0 && G.arcanaCost(s,'p','he_g').iron>0 && G.arcanaCost(s,'p','he_g').mana>G.arcanaCost(s,'p','he_e').mana);
  ok('study time grows with the circle', G.arcanaTime(s,'p','he_g')>G.arcanaTime(s,'p','he_e') && G.arcanaTime(s,'p','he_e')>G.arcanaTime(s,'p','he_c') && G.arcanaTime(s,'p','he_c')>G.arcanaTime(s,'p','he_a'));
  const t0=G.arcanaTime(s,'p','he_c'); const c2=near(s,c,3,7); const city2=G.foundCity(s,'p',c2.x,c2.y,'Second'); city2.buildings.magetower=10;
  ok('more tower levels in the realm: faster study', G.arcanaTime(s,'p','he_c')<t0, t0+' -> '+G.arcanaTime(s,'p','he_c'));
  ok('a tradition of the arcana pillar makes its node cheaper', (()=>{ const a=G.arcanaCost(s,'p','f_slots').mana; s.empires.p.traditions=['hedgelore','starsigns','magicircle']; const b=G.arcanaCost(s,'p','f_slots').mana; s.empires.p.traditions=[]; return b<a; })());
  const m0=G.manaOf(s,'p'), g0=s.empires.p.gold;
  ok('start a study', G.startStudy(s,'p','he_c')===null && A(s).active.id==='he_c');
  ok('…paid in mana and gold', G.manaOf(s,'p')<m0-cost.mana+1 && s.empires.p.gold<=g0-cost.gold);
  ok('one topic at a time', G.arcanaStatus(s,'p','he_ench').busy);
  const g1=s.empires.p.gold; G.cancelStudy(s,'p');
  ok('cancel refunds half', !A(s).active && Math.abs(s.empires.p.gold-(g1+cost.gold*0.5))<1, (s.empires.p.gold-g1)+' of '+cost.gold);
  G.startStudy(s,'p','he_c'); s.time=A(s).active.end+1; G.step(s,1);
  ok('the study completes and the spell is learned', G.knowsArcanum(s,'p','he_c') && G.spellsOf(s,'p').includes('hearthward'));
  ok('…and can be cast', G.castSpell(s,'p',c.id,'hearthward',c.id)===null);
  ok('lore effects reach G.mod', (()=>{ const g=G.mod(s,'p',c,'grain'); G.learnArcanum(s,'p','he_lore',{free:true}); return G.mod(s,'p',c,'grain')>=g; })());
}

// ---- the queue: unlimited, plan-path, dependants, moves ----
{ const s=fresh(); const c=G.capital(s,'p'); rich(c,s); c.buildings.magetower=15; era(s,'p',3);
  for(const t of ['wards','thaumaturgy','leymastery','archmagery']) G.research(s,'p').done[t]=true;
  ok('plan the path to an Archmage node queues every missing prerequisite in order', G.planStudy(s,'p','he_g')===null, A(s).queue.join(','));
  const q=[...(A(s).active?[A(s).active.id]:[]),...A(s).queue];
  ok('…the path is complete and ordered', ['he_lore','he_c','he_e','he_g'].every((x,i,l)=>q.indexOf(x)>=0&&(i===0||q.indexOf(l[i-1])<q.indexOf(x))), q.join(','));
  ok('queueing a topic whose prerequisites are missing is refused', /plan the path/.test(G.queueStudy(s,'p','ru_cap')||'')||/Open the school/.test(G.queueStudy(s,'p','ru_cap')||''));
  ok('the queue holds many topics (no length cap)', (()=>{ for(const id of DATA.arcanaOrder) if(!N[id].school||N[id].school==='hearthweather') G.planStudy(s,'p',id); return A(s).queue.length>=15; })(), A(s).queue.length);
  const before=A(s).queue.length; G.unqueueStudy(s,'p','he_e');
  ok('dropping a topic drops queued topics that need it', !A(s).queue.includes('he_g') && A(s).queue.length<before);
  const qq=A(s).queue; const i=qq.findIndex((x,j)=>j>0&&N[x].pre.some(g=>g.includes(qq[j-1])));
  ok('a topic cannot move ahead of its prerequisite', i>0 && !!G.moveStudy(s,'p',qq[i],-1), i);
  let guard=0; while((A(s).active||A(s).queue.length)&&guard++<400){ rich(c,s); s.time=(A(s).active?A(s).active.end:s.time)+1; G.step(s,1); G.processStudyQueue(s,'p'); }
  ok('the queue works through itself', !A(s).queue.length && A(s).known.length>20, A(s).known.length+' known');
  ok('a fork forsakes its twin: both are never learned', DATA.arcanaOrder.every(id=>!N[id].excl||!(A(s).known.includes(id)&&A(s).known.includes(N[id].excl))));
}
{ const s=fresh(); const c=G.capital(s,'p'); rich(c,s); c.buildings.magetower=5; era(s,'p',1);
  G.learnArcanum(s,'p','f_leydraw',{free:true});
  ok('a fork is open before the choice', G.arcanaStatus(s,'p','f_measured').ok);
  G.learnArcanum(s,'p','f_wild',{free:true});
  ok('…and forsaken after it', G.arcanaStatus(s,'p','f_measured').forsaken && /Forsaken/.test(G.queueStudy(s,'p','f_measured')||''));
  ok('Wild Channeling: more power, more strain', G.mod(s,'p',null,'strain')>1 && G.mod(s,'p',null,'spellPower')>1);
}

// ---- foreign schools: routes, cost, cap, closing ----
{ const s=fresh(); const c=G.capital(s,'p'); rich(c,s); c.buildings.magetower=5;
  const shut=DATA.schoolOrder.find(k=>!G.schoolAttuned(s,'p',k)&&!G.schoolRoutes(s,'p',k).length&&k!=='runecraft');
  const st0=G.openSchoolStatus(s,'p',shut);
  ok('no route: a foreign school stays shut', !st0.ok && st0.locked, shut+': '+st0.reason);
  ok('attuned schools need no opening', G.openSchoolStatus(s,'p','hearthweather').attuned);
  // ley route: an enclave of that school tapped by the capital
  const node=s.ley.nodes[0]; node.x=c.x; node.y=c.y; node.school='runecraft'; s.time+=20;
  ok('a held ley enclave of the school is a route', G.schoolRoutes(s,'p','runecraft').some(r=>r.kind==='ley'), JSON.stringify(G.schoolRoutes(s,'p','runecraft')));
  ok('open it', G.openSchool(s,'p','runecraft')===null && G.schoolsOf(s,'p').includes('runecraft'));
  ok('foreign study costs more than attuned', G.arcanaCost(s,'p','ru_lore').mana>G.arcanaCost(s,'p','he_lore').mana, G.arcanaCost(s,'p','ru_lore').mana+' vs '+G.arcanaCost(s,'p','he_lore').mana);
  // treaty route
  const ai=Object.values(s.empires).find(e=>e.id!=='p'&&e.race==='ash')||s.empires.a1;
  const theirs=G.attunedSchools(s,ai.id)[0];
  G.signTreaty(s,'research','p',ai.id,{mins:30});
  ok('a research pact with a realm that knows a school is a route', G.schoolRoutes(s,'p',theirs).some(r=>r.kind==='treaty'), theirs);
  // tower route: a captured city whose tower was raised by another school
  const t=near(s,c,3,7); const cap2=G.foundCity(s,'p',t.x,t.y,'Taken'); cap2.buildings.magetower=3; cap2.towerSchool='necromancy';
  ok('a held city with a Mage Tower of the school is a route', G.schoolRoutes(s,'p','necromancy').some(r=>r.kind==='tower'));
  ok('open a second foreign school', G.openSchool(s,'p',theirs===('necromancy')?'skywind':theirs)===null || G.openSchool(s,'p','necromancy')===null);
  const third=['necromancy',theirs].find(k=>!G.schoolsOf(s,'p').includes(k));
  const st3=third?G.openSchoolStatus(s,'p',third):{capped:true};
  ok('the cap stops a third foreign school', G.schoolCap(s,'p')===2 && st3.capped, (st3.reason||''));
  ok('Arcane Colleges raise the cap', (()=>{ G.research(s,'p').done.arcaneacad=true; const r=G.schoolCap(s,'p')===3; delete G.research(s,'p').done.arcaneacad; return r; })());
  G.learnArcanum(s,'p','ru_a',{free:true});
  ok('an opened school\\'s spells are castable', G.spellsOf(s,'p').includes('runehaste'));
  ok('closing a school keeps its lore but locks its spells', G.closeSchool(s,'p','runecraft')===null && G.knowsArcanum(s,'p','ru_a') && !G.spellsOf(s,'p').includes('runehaste'));
}

// ---- mastery ----
{ const s=fresh(); const c=G.capital(s,'p'); rich(c,s); c.buildings.magetower=1;
  ok('mastery starts at 0', G.spellMastery(s,'p','bountifulrain')===0);
  const p0=G.arcPowerMult(s,'p','bountifulrain'), k0=G.arcCostMult(s,'p','bountifulrain'), base=DATA.spells.bountifulrain.cool;
  for(let i=0;i<3;i++){ G.magicState(s).cool.p={}; G.castSpell(s,'p',c.id,'bountifulrain',c.id); }
  ok('three casts: rank 1', G.spellMastery(s,'p','bountifulrain')===1);
  ok('a mastered spell is stronger and cheaper', G.arcPowerMult(s,'p','bountifulrain')>p0 && G.arcCostMult(s,'p','bountifulrain')<k0);
  G.magicState(s).cool.p={}; G.castSpell(s,'p',c.id,'bountifulrain',c.id);
  ok('…with a shorter cooldown', (G.magicState(s).cool.p.bountifulrain-s.time) < base*60*G.pace(s).time);
  for(let i=0;i<20;i++){ G.magicState(s).cool.p={}; G.castSpell(s,'p',c.id,'bountifulrain',c.id); }
  ok('mastery caps at rank 3', G.spellMastery(s,'p','bountifulrain')===3);
  ok('G.spellMastery of an unknown spell is 0', G.spellMastery(s,'p','meteor')===0 && G.spellMastery(s,'zz','meteor')===0);
}

// ---- metamagic ----
{ const s=fresh(); const c=G.capital(s,'p'); rich(c,s); c.buildings.magetower=5;
  const t=near(s,c,3,7); const c2=G.foundCity(s,'p',t.x,t.y,'Twin');
  ok('unknown metamagic is ignored', G.castMetas(s,'p','bountifulrain',['empower']).length===0);
  learnAll(s,'p',n=>!!n.meta);
  ok('known metamagic applies', G.castMetas(s,'p','bountifulrain',['empower','twin']).join()==='empower,twin');
  ok('twin only fits city spells', G.castMetas(s,'p','scry',['twin']).length===0);
  const m0=G.manaOf(s,'p'); const cost=G.spellCost(s,'p','bountifulrain');
  ok('empowered + twinned cast', G.castSpell(s,'p',c.id,'bountifulrain',c.id,['empower','twin'])===null);
  ok('…costs more mana', m0-G.manaOf(s,'p')>=Math.round(cost*1.4*1.8)-1, (m0-G.manaOf(s,'p'))+' vs '+cost);
  const mc=(c.mods||[]).find(m=>m.key==='grain'), m2=(c2.mods||[]).find(m=>m.key==='grain');
  ok('…is stronger (empower)', mc && mc.mult>1.5, mc&&mc.mult.toFixed(3));
  ok('…and also lands on a second city (twin)', !!m2);
  G.magicState(s).cool.p={}; const until0=s.time;
  G.castSpell(s,'p',c.id,'bountifulrain',c.id,['extend']);
  const ext=(c.mods||[]).filter(m=>m.key==='grain').pop();
  ok('extend makes it last longer', ext.until-until0>20*60*G.pace(s).time*1.4);
  G.magicState(s).cool.p={}; G.castSpell(s,'p',c.id,'bountifulrain',c.id,['quicken']);
  ok('quicken halves the cooldown', G.magicState(s).cool.p.bountifulrain-s.time<=DATA.spells.bountifulrain.cool*60*G.pace(s).time*0.51);
}

// ---- enchantments ----
{ const s=fresh(); const c=G.capital(s,'p'); rich(c,s);
  ok('no tower, no slots', G.enchantSlots(s,c)===0);
  c.buildings.magetower=4; ok('tower 4: one slot', G.enchantSlots(s,c)===1);
  c.buildings.magetower=10; ok('tower 10: three slots', G.enchantSlots(s,c)===3);
  ok('an unlearned enchantment cannot be placed', G.enchantStatus(s,'p',c.id,'hearthblessing').locked);
  G.learnArcanum(s,'p','he_ench',{free:true});
  const g0=G.mod(s,'p',c,'grain'), net0=G.econ(s,c).net.mana;
  ok('enchant a city', G.enchantCity(s,'p',c.id,'hearthblessing')===null && G.hasEnchantment(c,'hearthblessing'));
  ok('G.enchantmentsOf gives id, name, icon, school, colour', (()=>{ const e=G.enchantmentsOf(s,c)[0]; return e.id==='hearthblessing'&&e.name&&e.icon&&e.school==='hearthweather'&&e.color===DATA.schools.hearthweather.color; })());
  ok('its effect reaches G.mod', G.mod(s,'p',c,'grain')>g0*1.05);
  const parts=G.econParts(s,c).mana||[];
  ok('upkeep shows as a mana consumption line in the city economy', parts.some(p=>p.kind==='use'&&/Enchantment: Hearth Blessing/.test(p.label)&&p.amount<0), JSON.stringify(parts.filter(p=>p.kind==='use')));
  ok('…and lowers the net mana', G.econ(s,c).net.mana<net0);
  ok('the same enchantment cannot be stacked', G.enchantStatus(s,'p',c.id,'hearthblessing').have);
  G.learnArcanum(s,'p','f_slots',{free:true});
  ok('a Foundations enchantment has no school and a neutral colour', G.enchantCity(s,'p',c.id,'aegis')===null && G.enchantmentsOf(s,c).find(e=>e.id==='aegis').school===null && !!G.enchantmentsOf(s,c).find(e=>e.id==='aegis').color);
  ok('Aegis wards the city', G.isWarded(s,c));
  c.buildings.magetower=1; G.advance(s,20,2);
  ok('a lowered tower sheds what it cannot hold', (c.ench||[]).length<=G.enchantSlots(s,c), (c.ench||[]).length+' / '+G.enchantSlots(s,c));
  c.buildings.magetower=10; c.ench=[{id:'hearthblessing',by:'p',t:0}]; c.res.mana=0; for(const x of G.citiesOf(s,'p')) x.res.mana=0;
  c.buildings.magetower=10; G.SINK_SAVE=G.SINK.towerMana; G.SINK.towerMana=50;
  G.advance(s,20,2); G.SINK.towerMana=G.SINK_SAVE;
  ok('no mana: the enchantment fades', !G.hasEnchantment(c,'hearthblessing'));
  // an enemy unravels it
  c.res.mana=1e5; G.enchantCity(s,'p',c.id,'hearthblessing');
  const ai=G.capital(s,'a1'); ai.buildings.magetower=10; rich(ai,s); era(s,'a1',3); G.research(s,'a1').done.thaumaturgy=true; G.research(s,'a1').done.wards=true;
  learnAll(s,'a1',n=>!n.school&&!n.excl); s.explored.fill(1);
  const far=Math.hypot(ai.x-c.x,ai.y-c.y);
  if(far<=14){ ok('an enemy Unravel dispels the enchantment', G.castSpell(s,'a1',ai.id,'unravel',c.id)===null && !G.hasEnchantment(c,'hearthblessing')); }
  else { G.dispelEnchantment(s,c.id,'hearthblessing','a1'); ok('an enemy dispel removes the enchantment', !G.hasEnchantment(c,'hearthblessing')); }
  // conquest breaks it
  c.res.mana=1e5; G.enchantCity(s,'p',c.id,'hearthblessing'); const t=near(s,c,3,7); const c3=G.foundCity(s,'p',t.x,t.y,'Lost'); c3.buildings.magetower=5; c3.res.mana=1e4; G.enchantCity(s,'p',c3.id,'hearthblessing');
  c3.owner='a1'; G.advance(s,20,2);
  ok('a conquered city loses the old owner\\'s enchantments', !G.hasEnchantment(c3,'hearthblessing'));
  // agents: a successful mana siphon unravels an enchantment
  if(G.resolveMission&&G.recruitSpy){
    const e=G.enchantmentsOf(s,c).length;
    const spy={ id:'sx', owner:'a1', home:ai.id, level:2, status:'work', task:{type:'mana',target:c.id,targetOwner:'p',phase:'work',t0:s.time,t1:s.time}, name:'Spy' };
    G.espionage&&0; const E=s.espionage||(s.espionage={});
    try{ G.resolveMission(s,spy,{roll:0,caughtRoll:1}); }catch(err){ console.log('spy err',err.message); }
    ok('an enemy agent\\'s mana siphon also unravels an enchantment', G.enchantmentsOf(s,c).length<e, e+' -> '+G.enchantmentsOf(s,c).length);
  }
}

// ---- celestial calendar ----
{ const s=fresh(); const c=G.capital(s,'p'); rich(c,s); c.buildings.magetower=5;
  const cj=G.conjunction(s);
  ok('a conjunction is scheduled', cj.next && DATA.schools[cj.next.school] && cj.next.end>cj.next.start);
  ok('the calendar is deterministic', JSON.stringify(G.conjunction(s))===JSON.stringify(G.conjunction({...s})));
  // find a window of the native school
  let k=null; const P=G.ARC.star.period*60*G.pace(s).time;
  for(let i=0;i<64&&k===null;i++){ s.time=i*P; const n=G.conjunction(s).next; if(n.school==='hearthweather') k=n; }
  ok('every school gets its turn (hearth within 64 periods)', !!k);
  s.time=k.start-60; const cost0=G.spellCost(s,'p','bountifulrain'), pow0=G.arcPowerMult(s,'p','bountifulrain');
  s.time=k.start+60;
  ok('during its conjunction a school\\'s spells are stronger and cheaper', G.spellCost(s,'p','bountifulrain')<cost0 && G.arcPowerMult(s,'p','bountifulrain')>pow0, cost0+' -> '+G.spellCost(s,'p','bountifulrain'));
  s.time=k.start-G.ARC.star.lead*60*G.pace(s).time+30; const n0=s.reports.length; G.magicState(s).starNoted=null;
  for(const h of G.slowHooks) h(s,0.1);
  ok('it is announced ahead in the reports', s.reports.length>n0 && /rises in/.test(s.reports[0].title||s.reports[s.reports.length-1].title), (s.reports[0]||{}).title);
}

// ---- every spell runs ----
{ const s=fresh(); s.explored.fill(1); const c=G.capital(s,'p'); rich(c,s); c.buildings.magetower=15; c.buildings.townhall=15; c.pop=600;
  learnAll(s,'p',n=>!n.excl||n.id.endsWith('_x')||n.id==='f_wild'||n.id==='f_battle');
  for(const k of DATA.schoolOrder) if(!A(s).opened.includes(k)) A(s).opened.push(k);
  const ft=near(s,c,6,9); const foe=G.foundCity(s,'a1',ft.x,ft.y,'Foe'); foe.pop=300; foe.buildings.wall=3; foe.buildings.farm=4; foe.units={ [DATA.races[s.empires.a1.race].units[0]]:80 };
  const land=s.tiles.find(t=>['plains','fertile','forest'].includes(t.terrain)&&!t.city&&!t.camp&&!t.oasis&&!t.ruin&&Math.hypot(t.x-c.x,t.y-c.y)<=3&&Math.hypot(t.x-c.x,t.y-c.y)>0);
  c.buildQueue.push({type:'farm',level:2,cost:{},dur:600,start:s.time,end:s.time+600});
  const errs=[], refused=[];
  for(const id of Object.keys(DATA.spells)){
    const sp=DATA.spells[id]; G.magicState(s).cool.p={}; G.magicState(s).strain={}; rich(c,s);
    let tgt; if(sp.target==='city') tgt=c.id; else if(sp.target==='enemy') tgt=foe.id;
    else if(sp.target==='tile'){ const t=sp.shape?s.tiles.find(t=>G.SHAPES[sp.shape](t)&&!t.city&&!t.camp&&!t.oasis&&!t.ruin&&Math.hypot(t.x-c.x,t.y-c.y)<=G.cityReach(s,c)+2.5&&Math.hypot(t.x-c.x,t.y-c.y)>0&&(sp.shape!=='raise'||[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{ const n=G.tileAt(s,t.x+dx,t.y+dy); return n&&!G.isWater(n); }))):(Math.hypot(foe.x-c.x,foe.y-c.y)<=(sp.range||14)?foe:G.tileAt(s,c.x+3,c.y)); tgt=t&&{x:t.x,y:t.y}; }
    if(sp.target==='tile'&&!tgt) continue;
    try{ const r=G.castSpell(s,'p',c.id,id,tgt); if(r) refused.push(id+': '+r); }catch(e){ errs.push(id+': '+e.message); }
  }
  ok('every spell casts without an error', !errs.length, errs.join(' | '));
  ok('…and few are refused for their target', refused.length<=8, refused.join(' | '));
  ok('casting spells grows mastery', Object.keys(A(s).mastery).length>40);
  // a few effects in detail
  const ms=s.moves.length;
  const t=near(s,c,3,5); s.moves.push({ id:'mx', owner:'a1', type:'attack', from:foe.id, fx:t.x, fy:t.y, x:c.x, y:c.y, units:{ [DATA.races[s.empires.a1.race].units[0]]:50 }, cargo:{}, depart:s.time, arrive:s.time+600 });
  const mv=s.moves[s.moves.length-1]; G.magicState(s).cool.p={};
  G.castSpell(s,'p',c.id,'entangle',c.id);
  ok('Entangling Roots slow an army marching on the city', mv.arrive>s.time+600, (mv.arrive-s.time).toFixed(0));
  G.magicState(s).cool.p={}; const n0=G.unitsCount(mv.units); G.castSpell(s,'p',c.id,'swarm',c.id);
  ok('Swarm of Thorns thins armies near the city', G.unitsCount(mv.units)<n0);
  const h0=G.happiness(s,c).value; G.magicState(s).cool.p={}; G.castSpell(s,'p',c.id,'kindle',c.id);
  ok('Kindle the Hearths raises happiness', G.happiness(s,c).value>h0, h0+' -> '+G.happiness(s,c).value);
  const l0=foe.loyalty=100; G.magicState(s).cool.p={}; G.castSpell(s,'p',c.id,'whispers',foe.id);
  ok('Whispers of Doubt lower an enemy city\\'s loyalty', foe.loyalty<l0);
  const r0=c.units.risen||0; G.magicState(s).cool.p={}; G.castSpell(s,'p',c.id,'bonelegion',c.id);
  ok('Bone Legion raises lasting Risen', (c.units.risen||0)>r0 && !(c.summoned||[]).some(x=>x.unit==='risen'));
}

// ---- deathless host, thornwall in battle ----
{ const s=fresh(); const c=G.capital(s,'p'); s.empires.p.deathless=s.time+1e5;
  const ctx={ m:{owner:'p',from:c.id}, r:{ attLost:{ [DATA.races.hearth.units[0]]:20 }, defLost:{}, attLeft:{} }, site:'camp', defOwner:null, tile:null };
  const r0=c.units.risen||0; for(const h of G.battleHooks) { try{ h(s,ctx); }catch(e){} }
  ok('Deathless Host: fallen soldiers rise as Risen', (c.units.risen||0)>=r0+6, (c.units.risen||0)-r0);
  c.thorns={until:s.time+1e4,pct:0.2}; const att={ a:{ spear:100 } };
  const ctx2={ m:{owner:'a1',from:'x'}, r:{ attLost:{}, defLost:{}, attLeft:{ spear:100 } }, site:'city', defOwner:'p', city:c };
  for(const h of G.battleHooks) { try{ h(s,ctx2); }catch(e){} }
  ok('Thornwall: assaulting survivors lose more', ctx2.r.attLeft.spear<100, ctx2.r.attLeft.spear);
}

// ---- AI studies, opens schools, keeps enchantments and casts ----
{ const s=G.newGame({name:'T',race:'hearth'}); s.settings.hostility=0;
  for(const e of Object.values(s.empires)){ if(e.id==='p') continue; const c=G.capital(s,e.id); c.buildings.magetower=10; c.buildings.townhall=10; rich(c,s); era(s,e.id,2);
    const en=DATA.arcanaOrder.find(id=>N[id].kind==='ench'&&N[id].school&&G.schoolAttuned(s,e.id,N[id].school)); if(en) G.learnArcanum(s,e.id,en,{free:true,path:true}); }
  const k0=Object.values(s.empires).filter(e=>e.id!=='p').reduce((a,e)=>a+A(s,e.id).known.length,0);
  for(let i=0;i<120;i++){ for(const e of Object.values(s.empires)) if(e.id!=='p'){ rich(G.capital(s,e.id),s); for(const h of G.aiHooks) { try{ h(s,e,1/6); }catch(err){ console.log('ai err',err.message); } } } G.advance(s,30,3); }
  const k1=Object.values(s.empires).filter(e=>e.id!=='p').reduce((a,e)=>a+A(s,e.id).known.length,0);
  ok('AI realms study the Grimoire', k1>k0+10, k0+' -> '+k1);
  ok('AI realms keep enchantments', Object.values(s.cities).some(c=>c.owner!=='p'&&(c.ench||[]).length), Object.values(s.cities).filter(c=>c.owner!=='p'&&(c.ench||[]).length).length);
  ok('AI realms cast (mastery grows)', Object.values(s.empires).some(e=>e.id!=='p'&&Object.keys(A(s,e.id).mastery).length));
  // open a school when a route lies at hand
  const ai=Object.values(s.empires).find(e=>e.id!=='p'); const ac=G.capital(s,ai.id); const want=DATA.schoolOrder.find(k=>!G.schoolAttuned(s,ai.id,k));
  A(s,ai.id).opened=[]; const nd=s.ley.nodes[1]; nd.x=ac.x; nd.y=ac.y; nd.school=want; s.time+=20; rich(ac,s);
  let opened=false; for(let i=0;i<400&&!opened;i++){ for(const h of G.aiHooks) h(s,ai,1/6); opened=G.schoolsOf(s,ai.id).includes(want); }
  ok('an AI realm opens a foreign school through a route', opened, want);
}

// ---- old saves ----
{ const s=fresh(); const c=G.capital(s,'p'); c.buildings.magetower=10;
  for(const e of Object.values(s.empires)) delete e.arcana; delete s.arcanaV;
  for(const x of Object.values(s.cities)) delete x.ench;
  ok('an old save gains a grimoire with the spells its towers could cast', G.spellsOf(s,'p').includes('summersun') && G.spellsOf(s,'p').includes('hearthward') && G.spellsOf(s,'p').includes('golems') && !G.spellsOf(s,'p').includes('eternalsummer'), G.spellsOf(s,'p').join(','));
  ok('…its known nodes form a coherent path (every prerequisite known)', A(s).known.every(id=>N[id].innate||N[id].pre.every(g=>g.some(x=>A(s).known.includes(x)))));
  for(const h of G.slowHooks) h(s,0.1);
  ok('…every realm is migrated in the next slow tick', s.arcanaV===1 && Object.values(s.empires).every(e=>e.arcana));
  ok('ley nodes of old saves get a stable school', s.ley.nodes.every(n=>{ delete n.school; const a=G.leySchool(n); delete n.school; return a===G.leySchool(n)&&DATA.schools[a]; }));
  G.save(s); const s2=G.load(); G.advance(s2,120,12);
  ok('save/load keeps the grimoire', s2 && A(s2).known.length===A(s).known.length);
}

console.log(fails?fails+' FAILED':'all arcana checks passed');
`);
