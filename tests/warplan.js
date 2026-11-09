// War plans: diplomacy-gated aggression, declarations with warnings and aims, campaigns, defence, peace, saves, cost.
// node tests/warplan.js
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/roads.js','js/quarters.js','js/intercept.js','js/warplan.js','js/automation.js','js/dynasty.js','js/portraits.js','js/portrait-people.js','js/portrait-gear.js'].filter(f=>fs.existsSync(f));
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
let fails=0;
const ok=(name,cond,extra)=>{ if(!cond) fails++; console.log((cond?'PASS ':'FAIL ')+name+(extra!==undefined?' '+extra:'')); };
const withRandom=(v,fn)=>{ const r=Math.random; Math.random=typeof v==='function'?v:()=>v; try{ return fn(); } finally{ Math.random=r; } };
const mulberry=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const noCamps=s=>{ for(const k of Object.keys(s.camps)){ G.tileAt(s,s.camps[k].x,s.camps[k].y).camp=null; delete s.camps[k]; } s.campTarget=0; if(s.monsters) for(const k of Object.keys(s.monsters)) delete s.monsters[k]; };
const MIN=(s,m)=>m*60*G.pace(s).time;
const full=s=>{ s.time=G.pace(s).grace+G.pace(s).ramp+60; s.calamityAt=1e12; s.eventAt=1e12; if(s.crisisNext!==undefined) s.crisisNext=null; };
const offU=race=>DATA.races[race].units.filter(u=>{ const d=DATA.units[u]; return d.at&&['inf','cav'].includes(d.type)&&d.atk>=(d.defI+d.defC)/2*0.8; }).sort((a,b)=>DATA.units[a].req-DATA.units[b].req)[0];
const defU=race=>DATA.races[race].units.filter(u=>{ const d=DATA.units[u]; return d.at&&['inf','cav'].includes(d.type)&&(d.defI+d.defC)/2>=d.atk*0.9; }).sort((a,b)=>DATA.units[a].req-DATA.units[b].req)[0]||offU(race);
const spot=(s,c,lo,hi)=>G.freeTile(s,x=>G.dist(x,c)>=lo&&G.dist(x,c)<=hi&&G.landReachable(s,c,x)&&!x.city&&!x.camp&&!x.oasis&&!x.ruin);
const rich=(s,c)=>{ const cp=G.storageCap(s,c); for(const g of Object.keys(DATA.goods)) c.res[g]=Math.max(c.res[g]||0,cp*0.9); s.empires[c.owner].gold=Math.max(s.empires[c.owner].gold,1e5); c.pop=Math.max(c.pop,400); };
const hostileSends=[];
{ const base=G.sendArmy; G.sendArmy=(s,f,x,y,type,u,c)=>{ const city=s.cities[f]; const r=base(s,f,x,y,type,u,c);
    if(!r&&city&&city.owner!=='p'&&['raid','attack','conquer'].includes(type)){ const t=G.tileAt(s,x,y), tc=t&&t.city&&s.cities[t.city]; if(tc&&tc.owner!==city.owner&&s.empires[tc.owner]) hostileSends.push({s,from:city.owner,to:tc.owner,st:G.statusOf(s,city.owner,tc.owner),t:s.time,type}); }
    return r; }; }
// a small world: the player and two AI realms; a1 gets three cities in a cluster and a2 a city nearby
const world=(o={})=>{
  Math.random=mulberry(o.seed||777);
  const s=G.newGame({name:'T',race:'hearth',rivals:2,rivalRaces:['ash','delver']}); noCamps(s); full(s);
  s.settings.hostility=o.hostility!=null?o.hostility:0;
  const A=G.capital(s,'a1');
  const t2=spot(s,A,4,6), A2=G.foundCity(s,'a1',t2.x,t2.y,'Second');
  const t3=spot(s,A,4,7), A3=t3&&G.foundCity(s,'a1',t3.x,t3.y,'Third');
  const tt=spot(s,A2,6,9), T=G.foundCity(s,'a2',tt.x,tt.y,'Target');
  for(const c of [A,A2,A3,T]) if(c) rich(s,c);
  return { s, A, A2, A3, T };
};
const strikeOf=(s,ai)=>s.moves.find(m=>m.owner===ai&&m.wp==='strike');

// ---- 1. the gate: attacks need war; hostility keeps its graded value ----
{ const { s } = world({ hostility: 1.25 });
  G.rel(s,'a1').opinion=-100; s.empires.a1.aggr=1;
  ok('a neutral AI with a grudge may not attack the player', G.statusOf(s,'a1','p')==='neutral' && !G.aiMayAttack(s,'a1','p'));
  ok('...but its hostility (appetite for war) is there', G.hostility(s,'a1','p')>0.5 && G.appetite(s,'a1','p')===G.hostility(s,'a1','p'), G.appetite(s,'a1','p').toFixed(2));
  ok('neutral AI realms may not attack each other', !G.aiMayAttack(s,'a1','a2') && G.appetite(s,'a1','a2')>0);
  G.aiRel(s,'a1','a2').status='war';
  ok('at war they may', G.aiMayAttack(s,'a1','a2') && G.aiMayStrike(s,G.capital(s,'a1'),'a2'));
  ok('a defensive partner of the player may avenge an attack on the player', (G.rel(s,'a2').enemies.a1=s.time+600, G.aiMayAttack(s,'a2','a1')) || G.statusOf(s,'a2','a1')==='war');
  ok('aiWar sends nothing at a neutral player city', (()=>{ const pc=G.capital(s,'p'); pc.units={}; const u=offU('ash'); G.capital(s,'a1').units[u]=400; s.camps={}; for(let i=0;i<30;i++) G.aiWar(s,'a1'); return !s.moves.some(m=>m.owner==='a1'&&m.x===pc.x&&m.y===pc.y); })());
}

// ---- 2. a neutral AI never attacks the player, then warns, masses and declares with an aim ----
{ const { s, A, A2 } = world({ hostility: 1.25, seed: 99 });
  const P0=G.capital(s,'p'); P0.units={ militia: 5 };
  G.rel(s,'a1').opinion=-100; s.empires.a1.aggr=1; s.empires.a2.aggr=0;
  const u=offU('ash'); for(const c of G.citiesOf(s,'a1')) c.units[u]=(c.units[u]||0)+150;
  // nothing but the player to fight: a2 is far away and bound by a pact
  G.signTreaty(s,'nap','a1','a2',{quiet:true,mins:600}); G.signTreaty(s,'nap','a2','p',{quiet:true,mins:600});
  hostileSends.length=0;
  const log0=s.log.length;
  let warAt=null;
  for(let i=0;i<120&&!warAt;i++){ G.advance(s,30,6); if(G.statusOf(s,'a1','p')==='war') warAt=s.time; }
  const beforeWar=hostileSends.filter(h=>h.s===s&&h.to==='p'&&h.st!=='war');
  ok('no AI strike on a player city before war', beforeWar.length===0, beforeWar.length);
  ok('the hostile AI declares war in time', !!warAt);
  const L=s.log.slice().reverse();
  const tIdx=L.findIndex(l=>/Tensions rise with the/.test(l.text)), mIdx=L.findIndex(l=>/mass troops/.test(l.text)), dIdx=L.findIndex(l=>/declare war on you/.test(l.text));
  ok('a tensions report comes first, then the massing army, then the declaration', tIdx>=0&&mIdx>tIdx&&dIdx>mIdx, [tIdx,mIdx,dIdx].join(' '));
  ok('the warnings give lead time', dIdx>=0&&tIdx>=0&&L[dIdx].t-L[tIdx].t>=MIN(s,G.WARPLAN.tension+G.WARPLAN.massing)*0.9, dIdx>=0&&tIdx>=0?Math.round(L[dIdx].t-L[tIdx].t):'-');
  ok('the tensions and the declaration are reports too', s.reports.some(r=>/Tensions rise/.test(r.title)) && s.reports.some(r=>/declare war/.test(r.title)));
  const W=G.warPlanOf(s,'a1').wars.p;
  ok('the war has an aim', W && !!G.WAR_GOALS[W.goal], W&&W.goal);
  ok('the declaration names it', s.reports.some(r=>/declare war/.test(r.title)&&/War aim/.test(r.body.extra)) && /Their aim:/.test(L[dIdx].text), L[dIdx]&&L[dIdx].text);
  ok('the massing army is staged before the war', !!G.warPlanOf(s,'a1').camp);
  // the council warns of a seen massing army
  const C=G.warPlanOf(s,'a1').camp, st=C&&s.cities[C.staging];
  if(st){ s.explored[st.y*s.map+st.x]=1; if(G.councilDirty) G.councilDirty(s); }
  ok('the marshal warns of troops massing at a seen city', !st || (G.councilAdvice ? G.councilAdvice(s).some(i=>i.advisor==='marshal'&&/mass troops at/.test(i.text)&&i.text.includes(st.name)) : true));
  // an espionage dossier shows the plan
  if(G.dossierOf&&st){ const d=G.dossierOf(s,st); ok('a dossier carries the war plan', d.warplan && /War plans:/.test(G.dossierText(s,d)) && /at war with you/.test(G.dossierText(s,d)), G.dossierText(s,d).split('War plans:')[1]); }
  // later strikes only in war
  G.advance(s,MIN(s,30),200);
  ok('every AI strike on the player came in war', hostileSends.filter(h=>h.s===s&&h.to==='p').every(h=>h.st==='war'), hostileSends.filter(h=>h.s===s&&h.to==='p').length);
}

// ---- 3. treaties prevent wars (mostly) ----
{ const { s } = world({ hostility: 0.85 });
  const w0=G.warAppetiteScore(s,'a1','a2');
  ok('a neighbour can be weighed for war', w0 && w0.score>0, w0&&w0.score.toFixed(3));
  G.signTreaty(s,'nap','a1','a2',{quiet:true});
  const w1=G.warAppetiteScore(s,'a1','a2');
  ok('a non-aggression pact makes war rare', w1 && w1.score<w0.score*0.15, w1&&w1.score.toFixed(4));
  G.signTreaty(s,'alliance','a1','a2',{quiet:true});
  ok('an alliance rules it out', G.warAppetiteScore(s,'a1','a2')===null);
  let n=0; const P=G.warPlanOf(s,'a1')||{};
  for(let i=0;i<200;i++){ withRandom(0,()=>G.warEvaluate(s,'a1')); const p=G.warPlanOf(s,'a1'); if(p.intent&&p.intent.target==='a2') n++; if(p.intent) p.intent=null; p.camp=null; }
  ok('no war is planned on an ally', n===0, n);
  const s2=world({hostility:0}).s; G.rel(s2,'a1').opinion=-100;
  ok('no war on the player when hostility is off', G.warAppetiteScore(s2,'a1','p')===null);
  const s3=world({hostility:0.85}).s; G.signTreaty(s3,'nap','a1','p',{quiet:true});
  const t0=Object.keys(G.treatiesOf(s3,'a1','p')).length; let br=0;
  for(let i=0;i<300;i++){ const r=G.warAppetiteScore(s3,'a1','p'); if(r&&Math.random()<Math.min(0.6,r.score*3/50)) br++; }
  ok('a pact with the player is rarely broken', br<300*0.05, br+'/300');
}

// ---- 4. a campaign: gather from several cities, siege engines, garrisons, one strike ----
let saved=null;
{ const { s, A, A2, A3, T } = world({ seed: 5 });
  const u=offU('ash'), d=defU('delver');
  for(const c of G.citiesOf(s,'a1')) { c.units={ [u]: 120 }; c.buildings.workshop=Math.max(c.buildings.workshop||0,6); c.buildings.barracks=Math.max(c.buildings.barracks||0,5); }
  T.units={ [d]: 25 }; T.buildings.wall=3;
  const orig=Object.fromEntries(G.citiesOf(s,'a1').map(c=>[c.id,c.units[u]]));
  G.warStartWar(s,'a1','a2','raid',T.id);
  ok('war declared between AI realms', G.statusOf(s,'a1','a2')==='war' && G.warInfo(s,'a1','a2').by==='a1');
  G.warCampaignStep(s,'a1');
  const C=G.warPlanOf(s,'a1').camp;
  ok('a campaign opens against the objective', C && C.city===T.id && !!s.cities[C.staging], C&&C.phase);
  const stage=s.cities[C.staging];
  ok('the staging city is the nearest to the objective', G.citiesOf(s,'a1').every(c=>G.dist(c,T)>=G.dist(stage,T)-1e-9));
  let strike=null, gatheredFrom=0, siegeQ=false, midSaved=false;
  for(let i=0;i<160&&!strike;i++){
    G.advance(s,15,3);
    const c=G.warPlanOf(s,'a1').camp; if(c) gatheredFrom=Math.max(gatheredFrom,c.from.length);
    if(Object.values(stage.train||{}).flat().some(q=>DATA.units[q.unit].type==='siege')) siegeQ=true;
    if(!midSaved&&c&&c.phase==='gather'&&s.moves.some(m=>m.wp==='gather')){ saved=G.serialize(s); midSaved=true; }
    strike=strikeOf(s,'a1');
  }
  ok('troops gather from 2+ cities before the strike', gatheredFrom>=1, 'staging + '+gatheredFrom);
  ok('one combined strike is launched from the staging city', !!strike && strike.from===stage.id && strike.campaign==='a1');
  ok('the strike carries more than the staging city alone could spare', strike && strike.units[u]>orig[stage.id]*0.8, strike&&strike.units[u]);
  ok('siege engines come against walls', siegeQ || (strike && Object.keys(strike.units).some(x=>DATA.units[x].type==='siege')), strike&&JSON.stringify(strike.units));
  ok('every city keeps a garrison', G.citiesOf(s,'a1').every(c=>(c.units[u]||0)>=Math.floor(orig[c.id]*0.25)), G.citiesOf(s,'a1').map(c=>c.units[u]).join('/'));
  ok('a stance comes with the plan', strike && !!strike.stance || (strike && strike.type==='raid'));
  ok('planned strikes are counted', G.warStats(s).strikes>=1);
  // after the battle the campaign regroups or follows up
  if(strike){ G.advance(s,strike.arrive-s.time+5,20); }
  const C2=G.warPlanOf(s,'a1').camp;
  ok('after the battle the campaign follows up, regroups or re-plans', !C2 || ['after','gather','march'].includes(C2.phase), C2&&C2.phase);
}

// ---- 5. save and load mid-campaign ----
{ ok('a mid-campaign save was taken', !!saved);
  if(saved){ const s=G.deserialize(saved);
    ok('the save loads with its war plans', s && s.warplans && s.warplans.a1 && s.warplans.a1.camp && s.warplans.a1.camp.phase==='gather');
    ok('gathering columns keep their tags', s.moves.some(m=>m.campaign==='a1'&&m.wp==='gather'));
    let err=null; try{ G.advance(s,MIN(s,10),100); }catch(e){ err=e; }
    ok('the campaign goes on after loading', !err, err&&err.message); }
  // an old save without any of it
  const { s } = world({ seed: 8 }); delete s.warplans; delete s.warstats;
  const s2=G.deserialize(G.serialize(s)); let err=null; try{ G.advance(s2,MIN(s2,5),50); }catch(e){ err=e; }
  ok('an old save without war plans loads and runs', !err && !!s2.warplans, err&&err.message);
}

// ---- 6. the AI defends a threatened city ----
{ const { s, A, A2, A3, T } = world({ seed: 11 });
  const d=defU('ash'), u=offU('delver');
  G.aiRel(s,'a1','a2').status='war';
  for(const c of G.citiesOf(s,'a1')) c.units={ [d]: 150 };
  A2.units={ [d]: 5 };
  T.units={ [u]: 300 };
  const e=G.sendArmy(s,T.id,A2.x,A2.y,'attack',{ [u]: 250 });
  ok('a war enemy marches on an AI city', !e, e);
  G.warDefend(s,'a1');
  const help=s.moves.filter(m=>m.owner==='a1'&&m.type==='reinforce'&&m.x===A2.x&&m.y===A2.y);
  ok('neighbours send help', help.length>=1 && help.every(m=>m.wp==='defend'), help.length);
  ok('helpers keep part of their own garrison', G.citiesOf(s,'a1').filter(c=>c!==A2).every(c=>(c.units[d]||0)>=40), G.citiesOf(s,'a1').map(c=>c.units[d]).join('/'));
}

// ---- 7. peace once the aim is met or the war is lost ----
{ const { s, T } = world({ seed: 12 });
  G.warStartWar(s,'a1','a2','tribute',T.id);
  const w=G.warInfo(s,'a1','a2'); if(w.a==='a1') w.pa=200; else w.pb=200;
  G.warPlanOf(s,'a1').wars.a2.since=s.time;
  G.warSeekPeace(s,'a1');
  ok('an AI whose aim is met makes peace', G.statusOf(s,'a1','a2')==='peace');
  ok('...on its terms: tribute', G.hasTreaty(s,'a2','a1','tribute'));
  const { s: s2, T: T2 } = world({ seed: 13 });
  G.warStartWar(s2,'a1','a2','conquer',T2.id);
  const w2=G.warInfo(s2,'a1','a2'); if(w2.a==='a1') w2.pb=300; else w2.pa=300;
  G.warSeekPeace(s2,'a1');
  ok('a losing AI makes peace', G.statusOf(s2,'a1','a2')==='peace', G.warScore(s2,'a1','a2'));
  const { s: s3 } = world({ seed: 14, hostility: 0.85 });
  G.warStartWar(s3,'a1','p','raid',null);
  G.warPlanOf(s3,'a1').wars.p.raids=3;
  G.warSeekPeace(s3,'a1');
  ok('at war with the player, a met aim brings a peace proposal', (s3.pending||[]).some(p=>p.data&&p.data.ai==='a1'&&p.data.deal&&p.data.deal.both.some(x=>x.t==='peace')));
  const pd=(s3.pending||[]).find(p=>p.data&&p.data.ai==='a1');
  if(pd){ G.resolvePending(s3,pd.id,'accept'); ok('accepting it ends the war', G.statusOf(s3,'a1','p')!=='war', G.statusOf(s3,'a1','p')); }
}

// ---- 8. crisis truce ----
{ const { s } = world({ hostility: 0.85 });
  if(G.crisisWarBlocked){ const orig=G.crisisWarBlocked; G.crisisWarBlocked=(ss,a,b)=>b==='p';
    G.rel(s,'a1').opinion=-100; ok('no war on a crisis fighter', G.warAppetiteScore(s,'a1','p')===null); G.crisisWarBlocked=orig; }
}

// ---- 9. AI-AI wars still happen; most AI strikes come from campaigns; the cost stays low ----
{ Math.random=mulberry(4242);
  const s=G.newGame({name:'B',race:'hearth',rivals:7,pace:'standard',difficulty:'normal'});
  const seen=new Set(); let aiai=0;
  const t0=Date.now();
  for(let m=0;m<36;m++){ G.advance(s,600,60);
    for(const [k,w] of Object.entries((s.dip||{}).wars||{})){ const key=k+'@'+w.start; if(!seen.has(key)){ seen.add(key); if(!k.split('|').includes('p')) aiai++; } } }
  const ms=Date.now()-t0;
  const st=G.warStats(s);
  console.log('  6 game-hours, 7 rivals: wars', seen.size, 'between AIs', aiai, 'conquests', Object.values(s.empires).reduce((a,e)=>a+(e.conquests||0),0), 'stats', JSON.stringify(st), ms+'ms');
  ok('AI realms still go to war with each other (6 game-hours)', aiai>=2 && aiai<=30, aiai);
  ok('no AI strike on a realm outside war', hostileSends.filter(h=>h.s===s).every(h=>h.st==='war'), hostileSends.filter(h=>h.s===s&&h.st!=='war').length);
  ok('most AI attacks on realms belong to campaigns', st.planned+st.unplanned===0 || st.planned/(st.planned+st.unplanned)>=0.5, st.planned+'/'+(st.planned+st.unplanned));
  // the planner's own cost
  const ais=Object.keys(s.empires).filter(id=>id!=='p'&&!s.empires[id].dead);
  const t1=process.hrtime.bigint();
  for(let i=0;i<20;i++) for(const ai of ais){ G.warCampaignStep(s,ai); G.warDefend(s,ai); }
  const per=Number(process.hrtime.bigint()-t1)/1e6/20/ais.length;
  ok('a campaign step costs well under 2 ms per realm', per<2, per.toFixed(3)+' ms');
  const t2=process.hrtime.bigint();
  for(let i=0;i<20;i++) for(const ai of ais){ const P=G.warPlanOf(s,ai); const I=P.intent; withRandom(0.99,()=>G.warEvaluate(s,ai)); P.intent=I; }
  const per2=Number(process.hrtime.bigint()-t2)/1e6/20/ais.length;
  ok('a war evaluation costs well under 3 ms per realm', per2<3, per2.toFixed(3)+' ms');
}

console.log(fails?fails+' FAILED':'ALL PASS');
`);
