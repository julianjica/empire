// Dynasties: rulers, families, aging, education, effects, death and succession, regencies, pretenders, claims, AI courts, saves.
// node tests/dynasty.js
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/prices.js','js/patrols.js','js/roads.js','js/quarters.js','js/intercept.js','js/warplan.js','js/automation.js','js/dynasty.js','js/portraits.js','js/portrait-people.js','js/portrait-gear.js'].filter(f=>fs.existsSync(f));
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
let fails=0;
const ok=(name,cond,extra)=>{ if(!cond) fails++; console.log((cond?'PASS ':'FAIL ')+name+(extra!==undefined?' '+extra:'')); };
const quiet=s=>{ s.settings.hostility=0; s.calamityAt=1e12; s.eventAt=1e12; G.aiPressure=()=>0; for(const k of Object.keys(s.camps)){ G.tileAt(s,s.camps[k].x,s.camps[k].y).camp=null; delete s.camps[k]; } s.campTarget=0; };
const fresh=(race='hearth')=>{ const s=G.newGame({name:'T',race}); quiet(s); return s; };
const SEASON=s=>G.DYN.seasonSec*G.pace(s).time;
// jump the calendar by n seasons and let the dynasty catch up (the same path a long absence takes)
const seasons=(s,n)=>{ s.time+=n*SEASON(s); G.dynTick(s,0); };
const withRandom=(v,fn)=>{ const r=Math.random; Math.random=()=>v; try{ return fn(); } finally{ Math.random=r; } };
const near=(s,c,lo=4,hi=7)=>G.freeTile(s,x=>G.dist(x,c)>=lo&&G.dist(x,c)<=hi&&G.landReachable(s,c,x));
const found=(s,owner,c,name)=>{ const t=near(s,c,3,8); return G.foundCity(s,owner,t.x,t.y,name); };

// ---- every realm has a ruler, distinct from the hero, with a family ----
{ const s=fresh(); const D=G.dynasty(s,'p'); const r=G.ruler(s,'p'); const h=G.hero(s);
  ok('the player has a ruler with a name, age, 2-3 traits and five stats', r && r.name && G.dynAge(s,r)>=30 && r.traits.length>=2 && r.traits.length<=3 && ['dip','mar','stw','lrn','int'].every(k=>r.st[k]>0), r&&(r.name+' '+G.dynAge(s,r)+' '+r.traits));
  ok('the ruler is not the hero', r.name!==h.name && D.heroId!==D.rulerId);
  const kid=D.people[D.heroId];
  ok('the hero is the ruler\\'s child (an adult of the blood)', kid && kid.name===h.name && kid.parents.includes(r.id) && G.dynAge(s,kid)>=17, kid&&G.dynAge(s,kid));
  ok('the ruler is married', !!G.dynSpouse(s,'p'));
  ok('every AI realm has its own dynasty', Object.keys(s.empires).filter(id=>id!=='p').every(id=>G.ruler(s,id) && G.dynasty(s,id).house));
  ok('G.ruler is null for unknown realms', G.ruler(s,'nobody')===null);
  ok('an heir is known', !!G.dynHeir(s,'p'));
}

// ---- aging follows the calendar: four seasons = one year ----
{ const s=fresh(); const r=G.ruler(s,'p'); G.DYN.mortality=0; const a0=G.dynAge(s,r);
  seasons(s,4);
  ok('one game year (4 seasons) ages the ruler one year', G.dynAge(s,r)===a0+1, a0+' -> '+G.dynAge(s,r));
  ok('the dynasty processed exactly four seasons', G.dynasty(s,'p').season===Math.floor(s.time/SEASON(s)));
  const yr=G.season(s).year; seasons(s,8);
  ok('two more years: +2 years and the calendar agrees', G.dynAge(s,r)===a0+3 && G.season(s).year===yr+2);
  // and through the real engine clock
  const s2=fresh(); s2.settings.pace='quick'; const r2=G.ruler(s2,'p'); const b0=r2.bornS; const before=G.dynasty(s2,'p').season;
  G.advance(s2,SEASON(s2)*1.05,300);
  ok('G.advance through a season ticks the dynasty', G.dynasty(s2,'p').season>=before+1, before+' -> '+G.dynasty(s2,'p').season);
  G.DYN.mortality=3;
}

// ---- births and growing up ----
{ const s=fresh(); G.DYN.mortality=0; const D=G.dynasty(s,'p'); const r=G.ruler(s,'p'); const sp=G.dynSpouse(s,'p');
  const mother=r.female?r:sp; mother.bornS=Math.floor(s.time/SEASON(s))-25*4;   // a young mother
  r.traits=['just']; sp.traits=['pious'];
  for(const k of G.dynChildren(s,'p')) k.traits=k.traits.filter(t=>t!=='sickly');
  const before=new Set(G.dynChildren(s,'p').map(c=>c.id));
  withRandom(0.01,()=>seasons(s,1));
  const kids=G.dynChildren(s,'p'); const baby=kids.find(c=>!before.has(c.id));
  ok('a married couple has a child', !!baby && G.dynAge(s,baby)===0, kids.length);
  ok('the child is of the blood with both parents', baby && baby.blood && baby.parents.includes(r.id) && baby.parents.includes(sp.id));
  ok('the child starts with stats from its parents', baby && ['dip','mar','stw','lrn','int'].every(k=>baby.st[k]>=1 && baby.st[k]<=20));
  // education: a tutor focus raises that stat
  ok('a focus can be set for a child', G.dynSetFocus(s,'p',baby.id,'lrn')===null && baby.focus==='lrn');
  ok('an unknown focus is refused', !!G.dynSetFocus(s,'p',baby.id,'cooking'));
  const l0=baby.st.lrn;
  baby.bornS-=5*4;   // five years old
  seasons(s,44);    // eleven years of lessons
  ok('learning grew under a learning tutor', baby.st.lrn>=l0+5, l0+' -> '+baby.st.lrn);
  ok('the child came of age at 16 and gained traits', G.dynAge(s,baby)>=16 && baby.traits.length>=1 && baby.focus===null, G.dynAge(s,baby)+' '+baby.traits);
  ok('an adult can no longer take a tutor', !!G.dynSetFocus(s,'p',baby.id,'mar'));
  // education steers traits
  let lrnTraits=0, n=0;
  for(let i=0;i<60;i++){ const k=D.people[G.dynasty(s,'p').rulerId]; const c={ id:'x'+i, traits:[], st:{dip:5,mar:5,stw:5,lrn:5,int:5}, focus:'lrn', blood:true, parents:[], bornS:Math.floor(s.time/SEASON(s))-15.9*4, name:'X'+i };
    D.people[c.id]=c; seasons(s,1); n++; if(c.traits.some(t=>DATA.rulerTraits[t].edu==='lrn')) lrnTraits++; delete D.people[c.id]; }
  ok('a learning education mostly yields learned traits (scholar, pious, patron)', lrnTraits/n>0.55, lrnTraits+'/'+n);
  G.DYN.mortality=3;
}

// ---- trait inheritance ----
{ let got=0; const N=300;
  for(let i=0;i<N;i++){ const s=fresh(); const D=G.dynasty(s,'p'); const r=G.ruler(s,'p'); r.traits=['scholar','fertile']; const sp=G.dynSpouse(s,'p'); sp.traits=['scholar'];
    const mother=r.female?r:sp; mother.bornS=Math.floor(s.time/SEASON(s))-25*4; G.DYN.mortality=0;
    const before=new Set(G.dynChildren(s,'p').map(c=>c.id));
    withRandom(0.01,()=>seasons(s,1)); const c=G.dynChildren(s,'p').find(x=>!before.has(x.id));
    if(c && c.traits.includes('scholar')) got++; if(i>40) break; }
  ok('heritable traits pass to children (always with a forced roll)', got>=30, got);
  G.DYN.mortality=3;
}

// ---- ruler effects through G.mod ----
{ const s=fresh(); const D=G.dynasty(s,'p'); const r=G.ruler(s,'p'); D.regent=null;
  r.traits=[]; for(const k of ['dip','mar','stw','lrn','int']) r.st[k]=8; D.rev++;
  const base={ tax:G.mod(s,'p',null,'tax'), atk:G.mod(s,'p',null,'atk'), bt:G.mod(s,'p',null,'buildTime'), rt:G.mod(s,'p',null,'researchTime') };
  r.traits=['builder','greedy','warlike']; D.rev++;
  ok('Builder: −5% building time via G.mod', Math.abs(G.mod(s,'p',null,'buildTime')/base.bt-0.95)<1e-9);
  ok('Greedy: +6% taxes', Math.abs(G.mod(s,'p',null,'tax')/base.tax-1.06)<1e-9);
  ok('Warlike: +4% attack (and rides to war: +2%)', Math.abs(G.mod(s,'p',null,'atk')/base.atk-1.04)<1e-9 || Math.abs(G.mod(s,'p',null,'atk')/base.atk-1.04*1.02)<1e-9, (G.mod(s,'p',null,'atk')/base.atk).toFixed(4));
  r.traits=['scholar']; D.rev++;
  ok('Scholar: research faster (trait and +2 learning)', G.mod(s,'p',null,'researchTime')/base.rt<0.95);
  r.traits=[]; r.st.stw=20; D.rev++;
  const t=G.mod(s,'p',null,'tax')/base.tax;
  ok('stewardship 20: a modest +4.8% tax', Math.abs(t-1.048)<1e-9, t.toFixed(4));
  r.st.stw=8; r.traits=['greedy','cruel']; D.rev++;
  const c=G.capital(s,'p'); const h=G.happiness(s,c);
  ok('Greedy and Cruel cost happiness (a line in the happiness breakdown)', h.why.some(w=>/character/.test(w.label) && w.value===-5), JSON.stringify(h.why.filter(w=>/character/.test(w.label))));
  r.traits=['pious']; D.rev++;
  if(G.faithRate){ const f0=(()=>{ r.traits=[]; D.rev++; return G.faithRate(s,'p'); })(); r.traits=['pious']; D.rev++; ok('Pious: +10% faith', f0===0 || Math.abs(G.faithRate(s,'p')/f0-1.1)<1e-9); }
  r.traits=[]; D.rev++; const cu0=G.cultureRate(s,c); r.traits=['patron']; D.rev++;
  ok('Patron of Arts: +10% culture', Math.abs(G.cultureRate(s,c)/cu0-1.1)<1e-9);
  r.st.int=8; r.traits=['paranoid']; D.rev++; const ci=G.mod(s,'p',c,'counterintel'); r.traits=[]; D.rev++;
  ok('Paranoid: +15% counter-intelligence', Math.abs(ci/G.mod(s,'p',c,'counterintel')-1.15)<1e-9);
  // every mod stays modest
  let worst=1; for(let i=0;i<200;i++){ const s2=fresh(); for(const id of Object.keys(s2.empires)){ const f=G.rulerFx(s2,id); for(const v of Object.values(f.mod)) worst=Math.max(worst,Math.abs(v-1)+1); } if(i>25) break; }
  ok('ruler multipliers stay within ±15%', worst<=1.15+1e-9, worst.toFixed(3));
}

// ---- regard between rulers (shared traits, marriage) ----
{ const s=fresh(); const a='a1'; const A=G.ruler(s,a), P=G.ruler(s,'p');
  A.traits=['just','pious']; P.traits=['just','pious']; for(const k of ['dip']) { A.st[k]=8; P.st[k]=8; } G.dynasty(s,a).rev++; G.dynasty(s,'p').rev++;
  const shared=G.rulerRegard(s,a,'p');
  P.traits=['cruel']; G.dynasty(s,'p').rev++;
  const clash=G.rulerRegard(s,a,'p');
  ok('shared traits warm rulers to each other; clashing natures chill them', shared>=10 && clash<0, shared+' vs '+clash);
  const h0=G.hostility(s,a,'p');
  P.traits=['cruel','warlike','deceitful']; A.traits=['just','charming']; G.dynasty(s,'p').rev++; G.dynasty(s,a).rev++;
  ok('a disliked ruler draws more aggression (hostility)', G.hostility(s,a,'p')>h0, h0.toFixed(3)+' -> '+G.hostility(s,a,'p').toFixed(3));
}

// ---- death and succession: eldest-born ----
{ const s=fresh(); const D=G.dynasty(s,'p'); const r=G.ruler(s,'p'); const kids=G.dynChildren(s,'p'); const eldest=kids[0];
  const ev=G.dynKill(s,'p','illness');
  ok('eldest-born: the eldest child inherits', G.ruler(s,'p')===eldest, eldest&&eldest.name);
  ok('the dead ruler joins the chronicle of kings', D.past.length===1 && D.past[0].name===r.name && D.past[0].cause==='illness');
  ok('a decision card asks how to meet the succession', (s.pending||[]).some(p=>p.kind==='dynSuccession'));
  ok('the Chronicle timeline records the coronation', G.chronicle(s).ev.some(e=>e.k==='crown' && /took the crown/.test(G.chronText(s,e))), G.chronicle(s).ev.filter(e=>e.k==='crown').map(e=>G.chronText(s,e)).join(' | '));
  const card=s.pending.find(p=>p.kind==='dynSuccession'); s.empires.p.gold=5000;
  const opt=card.options.find(o=>o.key==='coronation')||card.options.find(o=>o.key==='proceed');
  ok('the succession card resolves', G.resolvePending(s,card.id,opt.key)===null);
}

// ---- the hero as heir and ruler ----
{ const s=fresh(); const D=G.dynasty(s,'p'); const h=G.hero(s);
  ok('the hero is first in line (eldest child)', G.dynHeir(s,'p').id===D.heroId);
  G.dynKill(s,'p','age');
  ok('the hero inherits and keeps their name', G.ruler(s,'p').name===h.name && D.rulerId===D.heroId);
  ok('a ruling hero leads the armies (+attack)', G.rulerFx(s,'p').lead===true);
  // the hero-ruler falls in battle: maybe dies (50%)
  withRandom(0.1,()=>{ G.killHero(s,'p','in battle'); h.diedAt=s.time+1; G.dynTick(s,0.1); });
  ok('a hero-ruler who falls in battle may die: the crown passes on', D.past.length===2 && D.past[1].cause==='battle' && D.rulerId!==D.heroId, D.past.map(p=>p.cause));
}

// ---- designated heir and elective laws ----
{ const s=fresh(); const D=G.dynasty(s,'p'); D.prestige=500; G.DYN.mortality=0;
  ok('setting an heir needs the Designated heir law', !!G.dynSetHeir(s,'p',G.dynChildren(s,'p')[0].id));
  ok('changing the law costs prestige', G.dynSetLaw(s,'p','chosen')===null && D.prestige===500-G.DYN.lawCost && D.law==='chosen');
  ok('a new law unsettles the realm for a while', G.happiness(s,G.capital(s,'p')).why.some(w=>/law of succession/.test(w.label)));
  ok('the law cannot change again at once', !!G.dynSetLaw(s,'p','elective'));
  // add a younger child and name them heir
  const r=G.ruler(s,'p'); const sp=G.dynSpouse(s,'p');
  const young={ id:'yk', name:'Younger', female:true, bornS:Math.floor(s.time/SEASON(s))-17*4, blood:true, parents:[r.id,sp.id], spouse:null, from:null, traits:['charming'], st:{dip:15,mar:9,stw:9,lrn:9,int:9}, focus:null };
  D.people.yk=young;
  ok('a younger child can be named heir', G.dynSetHeir(s,'p','yk')===null && G.dynHeir(s,'p')===young);
  const st=G.dynStrength(s,'p',young);
  ok('passing over an elder child weakens the heir\\'s hold', st.why.includes('an elder sibling passed over'), st.why);
  G.dynKill(s,'p','illness');
  ok('designated heir: the chosen child inherits', G.ruler(s,'p')===young);
  // elective
  const s2=fresh(); const D2=G.dynasty(s2,'p'); D2.law='elective'; D2.prestige=800;
  for(const k of G.dynChildren(s2,'p')) k.bornS=Math.floor(s2.time/SEASON(s2))-30*4;
  const best=G.dynChildren(s2,'p').sort((a,b)=>Object.values(G.dynStats(b)).reduce((x,y)=>x+y)-Object.values(G.dynStats(a)).reduce((x,y)=>x+y))[0];
  for(const k of Object.keys(best.st)) best.st[k]=19;
  G.dynKill(s2,'p','illness');
  ok('elective: the ablest adult of the blood is elected', G.ruler(s2,'p')===best, best.name+' vs '+G.ruler(s2,'p').name);
  ok('elective: never a child on the throne', G.dynAge(s2,G.ruler(s2,'p'))>=16 && !D2.regent);
  G.DYN.mortality=3;
}

// ---- regency for a child heir ----
{ const s=fresh(); const D=G.dynasty(s,'p'); G.DYN.mortality=0;
  const r=G.ruler(s,'p'); const sp=G.dynSpouse(s,'p');
  for(const k of G.dynChildren(s,'p')) { k.dead=true; }
  D.heroId=null;
  const S=Math.floor(s.time/SEASON(s));
  const kid={ id:'ck', name:'Little', female:false, bornS:S-9*4, blood:true, parents:[r.id,sp.id], spouse:null, from:null, traits:[], st:{dip:6,mar:6,stw:6,lrn:6,int:6}, focus:null };
  D.people.ck=kid;
  const ev=G.dynKill(s,'p','illness');
  ok('a child inherits under eldest-born', G.ruler(s,'p')===kid);
  ok('a regent rules for the child (the surviving parent)', D.regent && D.regent.id===sp.id, D.regent&&D.regent.name);
  ok('a regency weighs on happiness', G.happiness(s,G.capital(s,'p')).why.some(w=>w.label==='A regency'));
  ok('a child heir means a succession crisis', ev.sev>0.2 && D.crisis, ev.sev);
  seasons(s,7*4+1);
  ok('the regency ends when the ruler comes of age', !D.regent && G.dynAge(s,kid)>=16, G.dynAge(s,kid));
  G.DYN.mortality=3;
}

// ---- no heir: crisis and a distant cousin ----
{ const s=fresh(); const D=G.dynasty(s,'p');
  for(const p of Object.values(D.people)) if(p.id!==D.rulerId && p.blood) p.dead=true;
  D.heroId=null;
  const pr=D.prestige;
  const ev=G.dynKill(s,'p','illness');
  const nr=G.ruler(s,'p');
  ok('no heir: a distant cousin is fetched', nr && nr.cousin && G.dynAge(s,nr)>=16);
  ok('…with a crisis and lost prestige', ev.sev>=0.35 && D.prestige<pr+5, ev.sev);
}

// ---- crisis: loyalty drops; a pretender may raise a city ----
{ const s=fresh(); const c=G.capital(s,'p'); found(s,'p',c,'Two'); const third=found(s,'p',c,'Three');
  const D=G.dynasty(s,'p');
  for(const p of Object.values(D.people)) if(p.id!==D.rulerId && p.blood) p.dead=true;
  D.heroId=null;
  for(const x of G.citiesOf(s,'p')) x.loyalty=100;
  third.loyalty=40;
  const ev=withRandom(0.05,()=>G.dynKill(s,'p','illness'));
  ok('a crisis drops loyalty everywhere', G.citiesOf(s,'p').every(x=>x.loyalty<100) && ev.drop>0, ev.drop);
  const card=(s.pending||[]).find(p=>p.kind==='dynPretender');
  ok('a pretender rises in the least loyal city (decision card)', card && card.data.city===third.id, card&&card.title);
  ok('the pretender is in the timeline', G.chronicle(s).ev.some(e=>e.k==='pretender'));
  const n=G.citiesOf(s,'p').length;
  G.resolvePending(s,card.id,'ignore');
  ok('ignored, a disloyal city rises in revolt', G.citiesOf(s,'p').length===n-1 && Object.values(s.camps).some(k=>k.pretender===card.data.name));
  ok('the crisis is a happiness line while it lasts', G.happiness(s,c).why.some(w=>w.label==='Succession crisis'));
  s.time=D.crisis.until+1; G.dynTick(s,0);
  ok('the crisis passes', !D.crisis);
}

// ---- foreign claim through a marriage ----
{ const s=fresh(); const a='a1'; G.rel(s,a).opinion=60;
  const D=G.dynasty(s,'p');
  const kid=G.dynChildren(s,'p').find(k=>G.dynAge(s,k)>=16) || G.ruler(s,'p');
  if(kid.spouse) D.people[kid.spouse].dead=true;
  const err=G.dynMarry(s,'p',kid.id,a);
  ok('a royal marriage with a friendly realm', err===null, err);
  ok('the houses are tied by marriage', G.dynTie(s,'p',a) && G.dynTie(s,a,'p'));
  ok('the wedding is in the timeline', G.chronicle(s).ev.some(e=>e.k==='wed'));
  // their ruler dies with a weak heir: we may press a claim
  const Da=G.dynasty(s,a);
  for(const p of Object.values(Da.people)) if(p.id!==Da.rulerId && p.blood && p.id!==Da.heroId) p.dead=true;
  Da.heroId=null; for(const p of Object.values(Da.people)) if(p.blood && p.id!==Da.rulerId) p.dead=true;
  withRandom(0.01,()=>G.dynKill(s,a,'illness'));
  const card=(s.pending||[]).find(p=>p.kind==='dynClaim');
  ok('a claim card appears for the player', !!card, card&&card.title);
  G.rel(s,a).status='neutral';
  G.resolvePending(s,card.id,'press');
  const cl=G.dynClaims(s).find(c=>c.by==='p'&&c.on===a);
  ok('pressing the claim means war with a war goal (a city)', cl && G.rel(s,a).status==='war' && s.cities[cl.city].owner===a);
  // take the city: the claim is vindicated
  const pr=D.prestige; s.cities[cl.city].owner='p'; G.dynTick(s,0); s.cities[cl.city].owner=a;
  ok('taking the claimed city vindicates the claim (+prestige)', D.prestige>=pr+G.DYN.claimPrestige && !G.dynClaims(s).some(c=>c===cl));
  // an AI realm with ties presses a claim on the player
  const s2=fresh(); const b='a2'; G.rel(s2,b).opinion=60;
  const k2=G.dynChildren(s2,'p').find(k=>G.dynAge(s2,k)>=16) || G.ruler(s2,'p'); if(k2.spouse) G.dynasty(s2,'p').people[k2.spouse].dead=true;
  ok('marriage with a second realm', G.dynMarry(s2,'p',k2.id,b)===null);
  const D2=G.dynasty(s2,'p'); for(const p of Object.values(D2.people)) if(p.blood && p.id!==D2.rulerId) p.dead=true; D2.heroId=null;
  G.rel(s2,b).status='neutral';
  withRandom(0.01,()=>G.dynKill(s2,'p','illness'));
  ok('a tied AI realm presses a claim on the player in a crisis (war)', G.dynClaims(s2).some(c=>c.by===b&&c.on==='p') && G.rel(s2,b).status==='war');
  ok('an AI claimant is more hostile', G.hostility(s2,b,'p')>0);
  // the treaty API (diplomacy.js) is optional
  ok('ties without a treaty API do not throw', typeof G.dynTie(s2,'a3','p')==='boolean');
}

// ---- assassination by spies (rare) and battle deaths ----
{ const s=fresh(); const a='a1'; const cap=G.capital(s,a); const D=G.dynasty(s,a); const name=G.ruler(s,a).name;
  const spy={ id:'sx', owner:'p', name:'Shade', level:3, xp:0, home:G.capital(s,'p').id, status:'work', task:{ type:'sabotage', target:cap.id, targetOwner:a, phase:'work', t0:0, t1:0 } };
  G.espState(s).spies.sx=spy;
  const out=G.resolveMission(s,spy,{ roll:0, caughtRoll:1, assassinRoll:0 });
  ok('a successful grave mission at a capital can slay the ruler', out.ok && out.assassinated && D.past.some(p=>p.name===name && p.cause==='assassin'), JSON.stringify(out.assassinated));
  const D2=G.dynasty(s,'p'); D2.lead=true; D2.rev++; const n=D2.past.length;
  withRandom(0,()=>{ for(const h of G.battleHooks) try{ h(s,{ m:{ owner:'p', type:'attack', units:{ [DATA.races.hearth.units[0]]:50 } }, r:{ win:false }, site:'camp', defOwner:null }); }catch(e){} });
  ok('a ruler who rides to war may die when the army breaks', D2.past.length===n+1 && D2.past[n].cause==='battle');
}

// ---- tales that know the ruler ----
{ const s=fresh(); ok('dynasty tales are registered', ['dyn_tutor','dyn_fever'].every(id=>G.story.byId(id)));
  const D=G.dynasty(s,'p'); const r=G.ruler(s,'p'); r.bornS-=30*4; D.rev++;
  s.time=60*60*G.pace(s).time; s.story={on:true};
  const err=G.story.force(s,'dyn_fever');
  const card=(s.pending||[]).find(p=>p.kind==='storylet');
  ok('the fever tale names the ruler', err===null && card && card.text.includes(r.name), err||card&&card.text.slice(0,80));
}

// ---- AI dynasties over many game-hours ----
{ const s=G.newGame({name:'T',race:'hearth',rivals:3}); s.calamityAt=1e12;
  const start={}; for(const id of Object.keys(s.empires)) start[id]=G.ruler(s,id).id;
  // twenty game years for the courts (fast-forwarding the calendar, as an absence would)
  let births=0, deaths=0;
  for(let y=0;y<20;y++){ seasons(s,4); }
  for(const id of Object.keys(s.empires)){ const D=G.dynasty(s,id); deaths+=D.past.length; births+=Object.values(D.people).filter(p=>p.bornS>0).length; }
  ok('over twenty years AI courts see births, deaths and successions', births>0 && deaths>0, 'births '+births+' successions '+deaths);
  const ties=Object.keys(s.empires).filter(a=>a!=='p').some(a=>Object.keys(s.empires).some(b=>b!==a&&b!=='p'&&G.dynTie(s,a,b)));
  ok('AI realms marry among themselves', ties || G.chronicle(s).ev.some(e=>e.k==='wed' && e.a!=='p' && e.b!=='p'));
  ok('no court grows without bound', Object.keys(s.empires).every(id=>Object.values(G.dynasty(s,id).people).filter(p=>!p.dead).length<=G.DYN.maxCourt+4));
  ok('every realm still has a living ruler', Object.keys(s.empires).every(id=>{ const r=G.ruler(s,id); return r && !r.dead; }));
  // and a few game-hours of the real engine
  const s2=G.newGame({name:'T',race:'ash',rivals:3}); s2.calamityAt=1e12;
  let err=null; try{ G.advance(s2,3*3600,900); }catch(e){ err=e; }
  ok('three game-hours of the full engine run with dynasties', !err, err&&err.stack);
  ok('…and every season was processed', Object.keys(s2.empires).every(id=>G.dynasty(s2,id).season===Math.floor(s2.time/SEASON(s2))));
}

// ---- save / load, old saves ----
{ const s=fresh(); const D=G.dynasty(s,'p'); const r=G.ruler(s,'p');
  const s2=G.deserialize(G.serialize(s));
  ok('the dynasty survives save and load', G.ruler(s2,'p').name===r.name && G.dynasty(s2,'p').house===D.house && G.rulerFx(s2,'p').mod.tax===G.rulerFx(s,'p').mod.tax);
  const old=JSON.parse(G.serialize(s)); delete old.dynasty;
  const s3=G.deserialize(JSON.stringify(old));
  ok('an old save without dynasties loads', !!s3 && !s3.dynasty);
  ok('…and a ruler is created lazily on first look', G.ruler(s3,'p') && G.dynasty(s3,'p').season===Math.floor(s3.time/SEASON(s3)));
  let e=null; try{ G.advance(s3,600,60); }catch(x){ e=x; }
  ok('an old save runs on with dynasties', !e, e&&e.stack);
  ok('the G.mod source is inert for realms without a dynasty yet', (()=>{ const s4=G.deserialize(JSON.stringify(old)); return G.mod(s4,'p',null,'tax')>0; })());
}

// ---- portraits by age ----
{ const young=G.portrait({race:'hearth',kind:'ruler',seed:'r1',age:'young'},64), old=G.portrait({race:'hearth',kind:'ruler',seed:'r1',age:'old'},64);
  ok('portraits honour an explicit age', young!==old && young.startsWith('<svg'));
  ok('portraits without an age are unchanged', G.portrait({race:'hearth',kind:'ruler',seed:'r1'},64)===G.portrait({race:'hearth',kind:'ruler',seed:'r1'},64));
}

console.log(fails?fails+' FAILED':'all passed');
`);
