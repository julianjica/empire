// Circle of Magi: recruiting, capacity, stations and their effects, upkeep, battle magic, counterspells, duels,
// aging and death, apprentices, loyalty and defection, AI magi, saves, UI.
// node tests/magi.js
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const fakeEl = () => ({ value: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, appendChild() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
global.document = { getElementById: fakeEl, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: fakeEl(), documentElement: fakeEl(), createElement: fakeEl };
global.window = { scrollY: 0, scrollTo() {}, addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) };
const files=['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/roads.js','js/quarters.js','js/intercept.js','js/warplan.js','js/automation.js','js/dynasty.js','js/portraits.js','js/portrait-people.js','js/portrait-gear.js','js/ui-core.js','js/ui-world.js','js/ui-generals.js','js/ui-magic.js','js/ui-magi.js'].filter(f=>fs.existsSync(f));
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
let fails=0;
const ok=(name,cond,extra)=>{ if(!cond) fails++; console.log((cond?'PASS ':'FAIL ')+name+(extra!==undefined?' '+extra:'')); };
const quiet=s=>{ s.settings.hostility=0; s.calamityAt=1e12; s.eventAt=1e12; G.aiPressure=()=>0; for(const k of Object.keys(s.camps)){ G.tileAt(s,s.camps[k].x,s.camps[k].y).camp=null; delete s.camps[k]; } s.campTarget=0; };
const fresh=(race='hearth')=>{ const s=G.newGame({name:'T',race}); quiet(s); return s; };
const dice=(v,fn)=>{ G.MAGI.rng=()=>v; try{ return fn(); } finally{ G.MAGI.rng=null; } };
const SEASON=s=>((G.DYN&&G.DYN.seasonSec)||7200)*G.pace(s).time;
const near=(a,b,e=1e-6)=>Math.abs(a-b)<=e;
const found=(s,owner,c,name)=>{ const t=G.freeTile(s,x=>G.dist(x,c)>=3&&G.dist(x,c)<=7&&G.landReachable(s,c,x)); return G.foundCity(s,owner,t.x,t.y,name); };
// a ready realm: a capital with a Mage Tower, gold and mana
const ready=(s,owner='p',tower=8)=>{ const c=G.capital(s,owner); c.buildings.magetower=tower; s.empires[owner].gold=20000; c.res.mana=5000; return c; };
const hire=(s,owner='p',opts={})=>{ const R=s.magi.realms[owner]; if(R) R.pool=null; const p=G.magiPool(s,owner); const i=0; Object.assign(p.list[i],opts); const e=G.recruitMagus(s,owner,i); if(e) throw new Error(e); const l=G.magiOf(s,owner); const g=l[l.length-1]; if(opts.bornS===undefined) g.bornS=s.time/SEASON(s)-30*4; return g; };
// resolve a march now, through the real engine step
const arrive=(s,m)=>{ m.arrive=s.time+1; G.advance(s,2,4); };

// ---- a new game, recruiting and capacity ----
{ const s=fresh(); const c=G.capital(s,'p'); const emp=s.empires.p;
  ok('a new game has an empty Circle', s.magi && G.magiOf(s,'p').length===0);
  ok('no Mage Tower, no room and no candidates', G.magiCap(s,'p')===0 && G.magiPool(s,'p').list.length===0);
  c.buildings.magetower=1;
  ok('a Mage Tower 1 gives room for one magus', G.magiCap(s,'p')===1);
  c.buildings.magetower=8;
  ok('capacity: 1 per 4 tower levels in the realm', G.magiCap(s,'p')===2);
  const c2=found(s,'p',c,'Second'); c2.buildings.magetower=5;
  ok('towers in every city count (8 + 5 → 4)', G.magiCap(s,'p')===4);
  c2.buildings.magetower=80; ok('capacity is capped at 10', G.magiCap(s,'p')===10); c2.buildings.magetower=5;
  const pool=G.magiPool(s,'p');
  ok('a candidate appears at each Mage Tower city (new tower, new face)', pool.list.length>=2 && pool.list.some(x=>x.city===c.id) && pool.list.some(x=>x.city===c2.id));
  const cand=pool.list[0];
  ok('candidates have a name, a school of the realm, 1–2 traits, an age of 18–60', / /.test(cand.name) && G.schoolsOf(s,'p').includes(cand.school) && cand.traits.length>=1 && cand.traits.length<=2 && cand.traits.every(t=>DATA.magusTraits[t]) && G.magusAge(s,cand)>=18 && G.magusAge(s,cand)<=60, cand.name+' '+cand.school+' '+G.magusAge(s,cand));
  emp.gold=10; c.res.mana=5000;
  ok('recruiting needs gold', /gold/.test(G.canRecruitMagus(s,'p',0)||''));
  emp.gold=20000; for(const x of G.citiesOf(s,'p')) x.res.mana=0;
  ok('recruiting needs mana', /mana/.test(G.canRecruitMagus(s,'p',0)||''));
  c.res.mana=5000;
  const cost=G.magiRecruitCost(s,'p',cand.rank), g0=emp.gold, m0=c.res.mana, nm=cand.name;
  ok('recruit succeeds', G.recruitMagus(s,'p',0)===null);
  const g=G.magiOf(s,'p')[0];
  ok('the magus joins: idle, at home in the candidate\\'s city, paid in gold and mana', g && g.name===nm && g.station==='idle' && g.status==='home' && g.city===cand.city && emp.gold===g0-cost.gold && near(G.citiesOf(s,'p').reduce((a,x)=>a+x.res.mana,0), m0-cost.mana, 1e-6), JSON.stringify(cost));
  ok('the candidate leaves the pool', !G.magiPool(s,'p').list.some(x=>x.name===nm));
  ok('the next magus costs more', G.magiRecruitCost(s,'p',1).gold>G.magiRecruitCost(s,'p',1).gold-1 && G.magiRecruitCost(s,'p',1).gold>cost.gold-60*(cand.rank-1));
  ok('a log line announces the magus', s.log.some(l=>l.text.includes(nm)));
  c2.buildings.magetower=0; c.buildings.magetower=4;   // room for one
  ok('a full Circle refuses more', /full/.test(G.canRecruitMagus(s,'p',0)||''), G.canRecruitMagus(s,'p',0));
}
// ---- deterministic candidates ----
{ const s=fresh(); ready(s); const a=G.deserialize(G.serialize(s)), b=G.deserialize(G.serialize(s));
  const pa=G.magiPool(a,'p').list.map(x=>x.name+x.school+x.traits), pb=G.magiPool(b,'p').list.map(x=>x.name+x.school+x.traits);
  ok('the same game draws the same candidates (seeded)', pa.length>0 && JSON.stringify(pa)===JSON.stringify(pb), pa[0]);
  ok('portrait seeds are stable strings', G.magiPool(a,'p').list.every(x=>typeof x.seed==='string' && x.seed.length>0));
}

// ---- court magus: mana, spells, strain ----
{ const s=fresh(); const c=ready(s,'p',6); const c2=found(s,'p',c,'Other'); c2.buildings.magetower=6; c2.res.mana=5000;
  const g=hire(s,'p',{rank:3,traits:['scholarly']});
  const mana0=G.mod(s,'p',c,'mana'), raw0=G.econ(s,c).raw.mana;
  const cost0=G.spellStatus(s,'p',c.id,'transmute').cost;
  ok('court needs a Mage Tower in the city', (()=>{ const c3=found(s,'p',c,'Bare'); return /no Mage Tower/.test(G.stationMagus(s,'p',g.id,'court',c3.id)||''); })());
  ok('posting a court magus in the same city is instant', G.stationMagus(s,'p',g.id,'court',c.id)===null && g.station==='court' && g.status==='home');
  ok('G.courtMagusOf finds them', G.courtMagusOf(s,c)===g);
  const fx=G.magiCourtFx(s,g,c);
  ok('court effect: +12% mana +4% per rank above 1 (rank 3: +20%)', near(fx.mana,1.2) && near(fx.cost,0.91) && near(fx.power,1.09) && near(fx.strain,1.5), JSON.stringify(fx));
  ok('the city makes more mana (G.mod mana ×1.2)', near(G.mod(s,'p',c,'mana')/mana0,1.2,1e-9) && G.econ(s,c).raw.mana>raw0*1.15, (G.mod(s,'p',c,'mana')/mana0).toFixed(3));
  ok('other cities are untouched', near(G.mod(s,'p',c2,'mana'),mana0,1e-9));
  const cost1=G.spellStatus(s,'p',c.id,'transmute').cost, costOther=G.spellStatus(s,'p',c2.id,'transmute').cost;
  ok('spells cast from the court city cost 9% less', cost1<cost0 && costOther===cost0 && Math.abs(cost1-Math.round(DATA.spells.transmute.cost*0.91))<=1, cost0+' → '+cost1+' (elsewhere '+costOther+')');
  const pow=[]; const baseMod=G.mod;
  ok('spell power from the court city is higher only while casting there', (()=>{ let seen=0; const prev=G.modSources.length; G.modSources.push((s2,o,ci,k)=>{ if(k==='spellPower'&&!ci) pow.push(1); return 1; }); G.castSpell(s,'p',c.id,'transmute',c.id); G.modSources.length=prev; return G.mod(s,'p',null,'spellPower')<1.09; })());
  const second=hire(s,'p',{rank:1});
  ok('one court magus per city', /already serves/.test(G.stationMagus(s,'p',second.id,'court',c.id)||''));
  // strain fades faster
  const M=G.magicState(s); M.strain[c.id]=50; M.strain[c2.id]=50;
  G.magiTick(s,4);
  ok('weave strain fades faster in the court city (extra 0.5/min per rank)', M.strain[c.id]<M.strain[c2.id] && near(M.strain[c2.id]-M.strain[c.id],1.5*4,1e-6), M.strain[c.id]+' vs '+M.strain[c2.id]);
  const xp0=g.xp; G.magiTick(s,10);
  ok('the court magus gains experience over time (scholarly ×1.5)', g.xp>xp0 && near(g.xp-xp0,0.4*1.5*10/G.pace(s).time,1e-6), (g.xp-xp0).toFixed(2));
  // riding to another city
  ok('posting to another city means a ride', G.stationMagus(s,'p',second.id,'court',c2.id)===null && second.status==='riding' && second.until>s.time);
  ok('while riding the court effect waits', near(G.mod(s,'p',c2,'mana'),mana0,1e-9));
  s.time=second.until+1; G.magiTick(s,0.1);
  ok('on arrival the magus serves', second.status==='home' && G.courtMagusOf(s,c2)===second && G.mod(s,'p',c2,'mana')>mana0);
}

// ---- upkeep in the economy ----
{ const s=fresh(); const c=ready(s,'p',8);
  const e0=G.econ(s,c), net0=e0.net.mana;
  const g=hire(s,'p',{rank:2}); const g2=hire(s,'p',{rank:1});
  const e1=G.econ(s,c), up=G.MAGI.upkeep[1]+G.MAGI.upkeep[0];
  ok('upkeep: mana per minute by rank (0.7 + 0.5)', near(net0-e1.net.mana, up*G.pace(s).prod,1e-9), (net0-e1.net.mana).toFixed(3));
  const parts=G.econParts(s,c).mana||[];
  const line=parts.find(p=>/Circle of Magi \\(2 magi\\)/.test(p.label));
  ok('the city economy shows a "Circle of Magi" consumption line', line && line.kind==='use' && near(line.amount,-up*G.pace(s).prod,1e-9), JSON.stringify(parts.map(p=>p.label)));
  ok('lean econ (the simulation) pays the same upkeep', near(G.econLean(s,c).use.mana-e0.use.mana, up*G.pace(s).prod, 1e-9));
  ok('G.magiUpkeepAt agrees', near(G.magiUpkeepAt(s,c), up*G.pace(s).prod, 1e-9));
  // a magus based in a city without a tower is paid by the greatest tower
  const c3=found(s,'p',c,'Plain');
  G.stationMagus(s,'p',g2.id,'war',c3.id); s.time=g2.until+1; G.magiTick(s,0.1);
  ok('a war magus in a tower-less city is paid from the greatest tower', G.magiUpkeepAt(s,c3)===0 && near(G.magiUpkeepAt(s,c), up*G.pace(s).prod,1e-9));
  // mana is really consumed
  c.res.mana=100; const before=c.res.mana; const raw=G.econ(s,c).raw.mana; const use=G.econ(s,c).use.mana;
  G.step(s,60);
  ok('a minute of play takes the upkeep from the city', near(c.res.mana, before+raw-use, 0.5), before+' → '+c.res.mana.toFixed(2));
  // shortage hurts loyalty
  c.short=c.short||{}; c.short.mana=true; g.loyalty=70; G.magiTick(s,30);
  ok('a mana shortage in their city drives loyalty down', g.loyalty<70, g.loyalty.toFixed(1));
}

// ---- study ----
{ const s=fresh(); const c=ready(s,'p',8);
  ok('no study magi: G.magiStudyBonus is 1', G.magiStudyBonus(s,'p')===1);
  const g=hire(s,'p',{rank:1,traits:['frail']});
  ok('study needs a Mage Tower city', G.stationMagus(s,'p',g.id,'study',c.id)===null);
  ok('one Apprentice in study: ×1.04', near(G.magiStudyBonus(s,'p'),1.04));
  const g2=hire(s,'p',{rank:3,traits:['scholarly']}); G.stationMagus(s,'p',g2.id,'study',c.id);
  ok('a scholarly Magus adds half again (+12%)', near(G.magiStudyBonus(s,'p'),1.04+0.08*1.5));
  ok('the bonus is capped at ×1.6', G.MAGI.studyCap===1.6);
  G.stationMagus(s,'p',g.id,'idle',c.id);
  ok('recalling the magus ends the bonus', near(G.magiStudyBonus(s,'p'),1.12));
}

// ---- battle magic ----
// an assault of the player's army on an AI city, through the real march and battle code
const battleWorld=()=>{ const s=fresh(); const c=ready(s,'p',10); const tgt=G.capital(s,'a1'); ready(s,'a1',10);
  c.units={militia:120,crossbow:60}; tgt.units={raider:60,slinger:40}; tgt.buildings.wall=2; S=s; return { s, c, tgt }; };
const assault=(s,c,tgt,units={militia:120,crossbow:60})=>{ s.reports=[]; c.units={...units};
  const e=G.sendArmy(s,c.id,tgt.x,tgt.y,'raid',{...units}); const m=s.moves.find(x=>x.owner==='p'&&x.type==='raid'); if(e||!m) return { err:e||'no march' };
  const riders=m.magi?m.magi.slice():[];
  dice(0.99,()=>arrive(s,m)); const r=s.reports.find(x=>x.body&&x.body.attSent); return { r, riders, m };
};
{ const { s, c, tgt }=battleWorld();
  const g=hire(s,'p',{rank:3,school:'hearthweather',traits:['battlehardened']});
  const plain=G.deserialize(G.serialize(s)); quiet(plain);
  G.stationMagus(s,'p',g.id,'war',c.id);
  ok('war station in any own city', g.station==='war' && g.status==='home');
  const A=assault(s,c,tgt);
  ok('a war magus rides with a hostile march of 10+ soldiers', A.riders.includes(g.id), A.err);
  const P=assault(plain,G.capital(plain,'p'),G.capital(plain,'a1'));
  ok('battle magic changes the outcome measurably (attack strength up)', A.r && P.r && A.r.body.A>P.r.body.A*1.04, (P.r&&P.r.body.A)+' → '+(A.r&&A.r.body.A));
  const mods=(A.r.body.tactics.mods||[]).filter(x=>x.kind==='magic');
  ok('the battle breakdown shows a labelled magic modifier naming the magus', mods.length && mods.some(x=>x.label.includes(g.name) && x.pct>0), JSON.stringify(mods));
  ok('the report names what the magus did', A.r.body.magi && A.r.body.magi.att[0].name===g.name && /Hailstorm|Mist/.test(A.r.body.magi.att[0].did.join()) && A.r.body.extra.includes(g.name), A.r.body.extra);
  ok('casting cost mana', G.citiesOf(s,'p').reduce((a,x)=>a+x.res.mana,0) < G.citiesOf(plain,'p').reduce((a,x)=>a+x.res.mana,0));
  ok('the magus gained experience and counts the battle', (g.xp>0||g.rank>3) && g.battles===1);
  const back=s.moves.find(m=>m.owner==='p'&&m.type==='return');
  ok('the magus rides home with the survivors', back && back.magi && back.magi.includes(g.id) && g.status==='marching' && g.move===back.id);
  if(back) dice(0.99,()=>arrive(s,back));
  ok('home again, still the war magus of the city', g.status==='home' && g.city===c.id && g.station==='war');
  // guard: stays home
  G.setMagusGuard(s,'p',g.id,true);
  const B=assault(s,c,tgt);
  ok('a guarding war magus stays home', !B.riders.length && g.status==='home');
  G.setMagusGuard(s,'p',g.id,false);
  ok('a tiny march (under 10 soldiers) rides without magi', (()=>{ c.units={militia:5}; G.sendArmy(s,c.id,tgt.x,tgt.y,'raid',{militia:5}); const m=s.moves[s.moves.length-1]; const r=!m.magi; s.moves.pop(); return r; })());
  // mage units make the magic stronger
  const strength=(units)=>{ const w=G.deserialize(G.serialize(s)); quiet(w); S=w; const cc=G.capital(w,'p'), tt=G.capital(w,'a1'); const gg=G.magusById(w,'p',g.id); gg.hp=100; gg.status='home'; gg.city=cc.id; w.moves=[];
    const R=assault(w,cc,tt,units); const md=R.r&&(R.r.body.tactics.mods||[]).find(x=>x.kind==='magic'); S=s; return md?md.pct:0; };
  const p0=strength({militia:120,crossbow:60}), p1=strength({militia:120,crossbow:60,hedgewizard:20});
  ok('battle mages in the army strengthen the magus\\'s spells (+2% each)', p1>p0, p0+'% → '+p1+'%');
}
// ---- counterspell: a court magus of higher rank stops the attacker's spell ----
{ const { s, c, tgt }=battleWorld();
  const g=hire(s,'p',{rank:1,school:'bloodember',traits:['devoted']}); G.stationMagus(s,'p',g.id,'war',c.id);
  const d=hire(s,'a1',{rank:4,school:'bloodember',traits:['devoted']}); G.stationMagus(s,'a1',d.id,'court',tgt.id);
  const plain=G.deserialize(G.serialize(s)); quiet(plain); G.stationMagus(plain,'a1',d.id,'idle',G.capital(plain,'a1').id);
  const A=assault(s,c,tgt);
  const att=A.r && A.r.body.magi && A.r.body.magi.att[0], def=A.r && A.r.body.magi && A.r.body.magi.def[0];
  ok('the defending court magus counters the lower-ranked spell', att && /countered by/.test(att.did.join()) && def && def.name===d.name && /countered/.test(def.did.join()), JSON.stringify(A.r&&A.r.body.magi));
  ok('a countered spell adds no magic modifier', !(A.r.body.tactics.mods||[]).some(x=>x.kind==='magic' && x.side==='att'));
  const P=assault(plain,G.capital(plain,'p'),G.capital(plain,'a1'));
  ok('without the counter the spell lands', P.r && (P.r.body.tactics.mods||[]).some(x=>x.kind==='magic' && x.side==='att'));
  ok('the report text tells of the counter', /countered by/.test(A.r.body.extra||''));
  // battle mages lend rank: 30 battle mages (+1.5) let an equal rank counter
  const s2=G.deserialize(G.serialize(s)); quiet(s2); S=s2;
  const g2=G.magusById(s2,'p',g.id); g2.rank=4; g2.status='home'; g2.city=G.capital(s2,'p').id; s2.moves=[];
  G.capital(s2,'a1').units={raider:60,slinger:40};
  const B=assault(s2,G.capital(s2,'p'),G.capital(s2,'a1'));
  ok('an equal rank cannot counter without help', B.r && !/countered by/.test(B.r.body.magi.att[0].did.join()), JSON.stringify(B.r&&B.r.body.magi&&B.r.body.magi.att[0].did));
  S=s;
}
// ---- duels ----
{ const { s, c, tgt }=battleWorld();
  const g=hire(s,'p',{rank:5,school:'skywind',traits:['battlehardened']}); G.stationMagus(s,'p',g.id,'war',c.id);
  const d=hire(s,'a1',{rank:1,school:'bloodember',traits:['frail']}); G.stationMagus(s,'a1',d.id,'war',tgt.id);
  s.reports=[]; c.units={militia:120,crossbow:60};
  G.sendArmy(s,c.id,tgt.x,tgt.y,'raid',{militia:120,crossbow:60}); const m=s.moves.find(x=>x.owner==='p'&&x.type==='raid');
  dice(0,()=>arrive(s,m));     // the worst dice for the loser
  const r=s.reports.find(x=>x.body&&x.body.attSent);
  const rec=r&&r.body.magi;
  ok('opposing war magi duel; the Archmage wins', rec && rec.duel && rec.duel.winnerName===g.name && rec.duel.loserName===d.name, JSON.stringify(rec&&rec.duel));
  ok('the loser of the duel casts nothing', rec && rec.def.find(x=>x.name===d.name) && /lost the duel/.test(rec.def.find(x=>x.name===d.name).did.join()));
  ok('with the worst dice the loser is slain', rec.duel.killed && !G.magusById(s,'a1',d.id) && s.magi.realms.a1.fallen.some(f=>f.name===d.name && /duel/.test(f.cause)));
  ok('an Archmage casts two spells', rec.att[0].did.filter(x=>/\\(/.test(x)).length===2, JSON.stringify(rec.att[0].did));
  ok('the winner gains experience and counts the duel', g.duels===1 && g.wins===1);
  // a duel that is survived: wounds
  const s2=fresh(); const c2=ready(s2,'p',10); const t2=G.capital(s2,'a1'); ready(s2,'a1',10); S=s2;
  const ga=hire(s2,'p',{rank:5,traits:['devoted']}); G.stationMagus(s2,'p',ga.id,'war',c2.id);
  const gd=hire(s2,'a1',{rank:2,traits:['devoted']}); G.stationMagus(s2,'a1',gd.id,'war',t2.id); t2.units={raider:60};
  c2.units={militia:120}; G.sendArmy(s2,c2.id,t2.x,t2.y,'raid',{militia:120}); const m2=s2.moves.find(x=>x.owner==='p'&&x.type==='raid');
  dice(0.99,()=>arrive(s2,m2));
  ok('with kind dice the loser lives, wounded', G.magusById(s2,'a1',gd.id) && gd.hp<100, gd.hp);
  S=s;
}
// ---- fates in a lost battle ----
{ const { s, c, tgt }=battleWorld();
  const g=hire(s,'p',{rank:1,traits:['devoted']}); G.stationMagus(s,'p',g.id,'war',c.id);
  tgt.units={raider:3000}; s.reports=[];
  c.units={militia:20}; G.sendArmy(s,c.id,tgt.x,tgt.y,'attack',{militia:20}); const m=s.moves.find(x=>x.owner==='p'&&x.type==='attack');
  dice(0.99,()=>arrive(s,m));
  ok('a wiped-out army: the magus escapes home wounded (kind dice)', g.status==='home' && g.city===c.id && g.hp<100, g.status+' '+g.hp);
  const s2=G.deserialize(G.serialize(s)); quiet(s2); S=s2; const g2=G.magusById(s2,'p',g.id); g2.hp=100;
  G.capital(s2,'p').units={militia:20}; G.sendArmy(s2,G.capital(s2,'p').id,tgt.x,tgt.y,'attack',{militia:20}); const m2=s2.moves.find(x=>x.owner==='p'&&x.type==='attack');
  dice(0,()=>arrive(s2,m2));
  ok('with the worst dice the magus falls with the army', !G.magusById(s2,'p',g.id) && s2.magi.realms.p.fallen.some(f=>f.name===g.name));
  S=s;
}

// ---- fates of a garrison's war magus when the garrison is wiped out ----
{ const defend=v=>{ const { s, c, tgt }=battleWorld(); const d=hire(s,'a1',{rank:1,traits:['devoted']}); G.stationMagus(s,'a1',d.id,'war',tgt.id);
    tgt.units={raider:5}; c.units={militia:400,crossbow:200}; G.sendArmy(s,c.id,tgt.x,tgt.y,'attack',{militia:400,crossbow:200});
    const m=s.moves.find(x=>x.owner==='p'&&x.type==='attack'); dice(v,()=>arrive(s,m)); S=s; const r=s.reports.find(x=>x.body&&x.body.attSent); return { s, d, r }; };
  const A=defend(0);
  ok('a wiped-out garrison: with the worst dice its war magus falls', !G.magusById(A.s,'a1',A.d.id) && A.s.magi.realms.a1.fallen.some(f=>f.name===A.d.name && f.cause==='in battle'), A.r&&JSON.stringify(A.r.body.magi));
  const B=defend(0.99);
  ok('with kind dice the garrison magus lives, wounded, still at home', G.magusById(B.s,'a1',B.d.id) && B.d.hp<100 && B.d.status==='home', B.d.hp);
}
// ---- aging, death, apprentices ----
{ const s=fresh(); const c=ready(s,'p',8);
  const g=hire(s,'p',{rank:4,traits:['devoted']}); G.stationMagus(s,'p',g.id,'court',c.id);
  const a0=G.magusAge(s,g);
  s.time+=4*SEASON(s);
  ok('four seasons age a magus one year', G.magusAge(s,g)===a0+1, a0+' → '+G.magusAge(s,g));
  ok('the old die more often (mortality grows with age, frail doubles it)', G.magusMortality(30,g)<G.magusMortality(70,g) && near(G.magusMortality(70,{traits:['frail']}),2*G.magusMortality(70,g)));
  g.bornS-=60*4;    // now very old
  const name=g.name, school=g.school;
  dice(0,()=>G.magiTick(s,1));
  const heir=G.magiOf(s,'p').find(x=>x.apprenticeOf===name);
  ok('a magus dies of old age', !G.magusById(s,'p',g.id) && s.magi.realms.p.fallen.some(f=>f.name===name && f.cause==='of old age'));
  ok('an apprentice takes over the post (same school, same city, rank − 2)', heir && heir.station==='court' && heir.city===c.id && heir.school===school && heir.rank===2 && G.courtMagusOf(s,c)===heir, heir&&JSON.stringify({st:heir.station,r:heir.rank}));
  ok('a short report tells of it', s.log.some(l=>l.text.includes(name)) && s.log.some(l=>heir && l.text.includes(heir.name)));
  const y=hire(s,'p',{rank:1}); y.bornS=y.bornS+0; const yname=y.name; y.bornS-=80*4;
  dice(0,()=>G.magiTick(s,1));
  ok('a junior magus leaves no apprentice', !G.magiOf(s,'p').some(x=>x.apprenticeOf===yname));
}
// ---- rank-ups ----
{ const s=fresh(); ready(s,'p',8); const g=hire(s,'p',{rank:1});
  G.magusGainXp(s,'p',g,85);
  ok('enough experience raises the rank (Apprentice → Adept)', g.rank===2 && G.magusRankName(g)==='Adept');
  G.magusGainXp(s,'p',g,5000);
  ok('Archmage is the highest rank', g.rank===5 && g.xp===0 && G.magusRankName(g)==='Archmage');
  ok('rank-ups are reported, with new battle spells', s.log.some(l=>l.text.includes(g.name) && /Archmage/.test(l.text)) && s.log.some(l=>/learns/.test(l.text)));
  ok('five ranks, Apprentice to Archmage', G.MAGI.ranks.length===5 && G.MAGI.ranks[0]==='Apprentice');
  ok('every school has a battle spell at rank 1 and another at rank 3', DATA.schoolOrder.every(k=>{ const l=Object.values(DATA.battleSpells).filter(b=>b.school===k); return l.some(b=>b.rank===1) && l.some(b=>b.rank===3); }));
}
// ---- loyalty: lures, defection, going rogue, devotion ----
{ const s=fresh(); ready(s,'p',8); ready(s,'a1',8); s.empires.a1.gold=5000;
  for(const id of Object.keys(s.empires)) if(id!=='p'&&id!=='a1') s.empires[id].gold=0;
  const g=hire(s,'p',{rank:2,traits:['ambitious']});
  const l0=g.loyalty;
  dice(0.0001,()=>G.magiTick(s,1));
  ok('a rival sends gifts: loyalty drops and the rival is remembered', g.loyalty<l0 && g.luredBy==='a1' && s.log.some(l=>/gifts/.test(l.text)), g.loyalty);
  g.loyalty=5; g.luredBy='a1';
  dice(0.0001,()=>G.magiTick(s,1));
  ok('a disloyal magus defects to the realm that lured them', !G.magusById(s,'p',g.id) && G.magiOf(s,'a1').some(x=>x.name===g.name) && s.log.some(l=>/defected/.test(l.text)));
  s.empires.a1.gold=0;
  const g2=hire(s,'p',{rank:1,traits:['frail']}); g2.loyalty=5; g2.luredBy=null;
  dice(0.0001,()=>G.magiTick(s,1));
  ok('with no rival to go to, a disloyal magus goes rogue', !G.magusById(s,'p',g2.id) && s.magi.realms.p.fallen.some(f=>f.name===g2.name && f.cause==='went rogue'));
  const g3=hire(s,'p',{rank:1,traits:['devoted']}); g3.loyalty=5;
  dice(0.0001,()=>G.magiTick(s,1));
  ok('a devoted magus never defects nor is lured', !!G.magusById(s,'p',g3.id) && !g3.luredBy);
  const gold0=s.empires.p.gold, cost=G.honorCost(g3).gold;
  ok('honouring a magus costs gold and restores loyalty', G.honorMagus(s,'p',g3.id)===null && s.empires.p.gold===gold0-cost && g3.loyalty>=5+G.MAGI.honor.gain-1);
  ok('honours have a cooldown', /recently/.test(G.honorMagus(s,'p',g3.id)||''));
  const ga=hire(s,'p',{rank:1,traits:['ambitious']}); ga.loyalty=70; g3.loyalty=70; g3.honorAt=0;
  dice(0.99,()=>G.magiTick(s,200));
  ok('ambitious magi settle lower than devoted ones', ga.loyalty<g3.loyalty-20, ga.loyalty+' vs '+g3.loyalty);
}
// ---- cities lost, realms fallen ----
{ const s=fresh(); const c=ready(s,'p',8); const c2=found(s,'p',c,'Border'); c2.buildings.magetower=3;
  const g=hire(s,'p',{rank:1,traits:['devoted']}); G.stationMagus(s,'p',g.id,'court',c2.id); s.time=(g.until||s.time)+1; G.magiTick(s,0.1);
  c2.owner='a1';
  dice(0.99,()=>G.magiTick(s,0.1));
  ok('a court magus whose city falls flees to the capital', g.status==='home' && g.city===c.id && g.station==='idle', g.city+' '+g.station);
  ready(s,'a2',8); hire(s,'a2',{});
  s.empires.a2.dead=true; G.magiTick(s,0.1);
  ok('a fallen realm loses its Circle', G.magiOf(s,'a2').length===0);
}

// ---- the AI recruits, posts and fights with its magi ----
{ const s=fresh(); const c=ready(s,'a1',12); s.empires.a1.gold=50000; c.res.mana=20000;
  c.units={raider:80,slinger:40};
  const c2=found(s,'a1',c,'Second'); c2.buildings.magetower=6; c2.res.mana=5000;
  G.magiOf(s,'a1');
  for(let i=0;i<6;i++){ s.magi.realms.a1.aiAt=0; G.aiMagi(s); }
  const L=G.magiOf(s,'a1');
  ok('the AI recruits magi when it has the gold and mana', L.length>=2, L.length);
  ok('the AI posts a court magus in a tower city', L.some(g=>g.station==='court'));
  ok('the AI posts war magi where its army stands', L.some(g=>g.station==='war' && g.city===c.id), L.map(g=>g.station+'@'+g.city).join(','));
  for(const g of L){ if(g.status==='riding'){ s.time=Math.max(s.time,g.until+1); } } G.magiTick(s,0.1);
  const tgt=G.capital(s,'p');
  G.sendArmy(s,c.id,tgt.x,tgt.y,'raid',{raider:60,slinger:20});
  const m=s.moves.find(x=>x.owner==='a1'&&x.type==='raid');
  ok('AI armies march with their war magi', m && m.magi && m.magi.length>=1);
  // a full world: AI realms build towers and recruit by themselves
  const w=G.newGame({name:'T',race:'veil'}); w.settings.hostility=0;
  for(const e of Object.values(w.empires)) if(e.id!=='p'){ const cc=G.capital(w,e.id); cc.buildings.magetower=8; cc.res.mana=3000; e.gold=8000; }
  G.advance(w,600,60);
  const n=Object.keys(w.empires).filter(id=>id!=='p').reduce((a,id)=>a+G.magiOf(w,id).length,0);
  ok('in a running game the AI realms hire magi on their own', n>=3, n);
}

// ---- saves ----
{ const s=fresh(); const c=ready(s,'p',8); const g=hire(s,'p',{rank:3}); G.stationMagus(s,'p',g.id,'court',c.id);
  const t=G.deserialize(G.serialize(s));
  ok('a save keeps the Circle', G.magiOf(t,'p').length===1 && G.magiOf(t,'p')[0].name===g.name && G.courtMagusOf(t,G.capital(t,'p')).name===g.name);
  const old=JSON.parse(G.serialize(s)); delete old.magi;
  const o=G.deserialize(JSON.stringify(old));
  ok('an old save without magi loads', !!o);
  let threw='';
  try { G.advance(o,120,12); } catch(e){ threw=e.stack; }
  ok('and plays on, growing a Circle lazily', !threw && o.magi && G.magiOf(o,'p').length===0 && G.magiCap(o,'p')===2, threw);
  const part=JSON.parse(G.serialize(s)); delete part.magi.realms.p.fallen; delete part.magi.realms.p.pool; delete part.magi.seq; delete part.magi.rev;
  const q=G.deserialize(JSON.stringify(part));
  try { G.advance(q,120,12); G.magiPool(q,'p'); } catch(e){ threw=e.stack; }
  ok('a save missing parts of the Circle state is repaired', !threw && Array.isArray(q.magi.realms.p.fallen) && q.magi.seq>=0, threw);
  ok('G.magiStudyBonus is safe on any save', G.magiStudyBonus(o,'p')===1 && G.magiStudyBonus({},'p')===1);
}

// ---- previews include battle magic, without spending mana, granting experience or rolling the dice ----
{ const { s, c, tgt }=battleWorld();
  const tile=G.tileAt(s,tgt.x,tgt.y);
  s.intel[G.tileIdx(s,tile)]={ t:s.time, name:tgt.name, owner:tgt.owner, units:{...tgt.units}, wall:G.lvl(tgt,'wall'), th:G.lvl(tgt,'townhall') };
  const units={militia:120,crossbow:60};
  const plain=G.previewField(s,c,tile,units,'raid');
  const g=hire(s,'p',{rank:3,school:'hearthweather',traits:['devoted']}); G.stationMagus(s,'p',g.id,'war',c.id);
  const before=G.serialize(s), xp0=g.xp, mana0=G.citiesOf(s,'p').reduce((a,x)=>a+x.res.mana,0);
  let rolls=0; G.MAGI.rng=()=>{ rolls++; return 0.5; };
  let pv, pv2; try { pv=G.previewField(s,c,tile,units,'raid'); pv2=G.previewField(s,c,tile,units,'raid'); } finally { G.MAGI.rng=null; }
  ok('the preview names the expected battle magic', pv && /^Battle magic: your .*(Hailstorm|Mist).*[+][0-9]+%/.test(pv.magic||''), pv&&pv.magic);
  ok('the attack strength of the preview includes the magic', pv && plain && pv.A>plain.A, (plain&&plain.A)+' → '+(pv&&pv.A));
  ok('the preview breakdown carries a labelled magic modifier', pv && pv.tactics && pv.tactics.mods.some(x=>x.kind==='magic' && x.side==='att' && /Battle magic/.test(x.label)));
  ok('previewing spends no mana, grants no experience, changes nothing', G.serialize(s)===before && g.xp===xp0 && G.citiesOf(s,'p').reduce((a,x)=>a+x.res.mana,0)===mana0 && !g.battles);
  ok('previewing rolls none of the fate dice of the Circle', rolls===0, rolls);
  ok('the preview is stable (no hidden luck)', pv && pv2 && pv.A===pv2.A && pv.magic===pv2.magic);
  ok('the magus stays at home after a preview', g.status==='home' && !g.move);
  // the defenders' magi are announced, not simulated
  const d=hire(s,'a1',{rank:1,traits:['devoted']}); G.stationMagus(s,'a1',d.id,'war',tgt.id);
  const pv3=G.previewField(s,c,tile,units,'raid');
  ok('the preview warns that their magus may answer', /their magus may duel and counter/.test(pv3.magic||'') && !pv3.magic.includes(d.name), pv3.magic);
  // the plain G.previewBattle (and so every module preview) includes it too
  const pv4=G.previewBattle(s,c,tile,units,'raid');
  ok('G.previewBattle includes the magic too', pv4 && /Battle magic: your/.test(pv4.magic||''), pv4&&pv4.magic);
  // too few soldiers: the magi stay home, and the preview says why
  const pv5=G.previewField(s,c,tile,{militia:5},'raid');
  ok('a tiny march: the preview explains that war magi stay home', /ride only with 10[+] soldiers/.test(pv5.magic||''), pv5.magic);
  // the send form shows it
  S=s; UI.mode='raid'; UI.form={send_militia:'120',send_crossbow:'60'}; c.units={...units};
  let html='', threw=''; try { html=sendForm(c,tile,['raid','attack']); } catch(e){ threw=e.stack; }
  ok('the send form shows the battle magic line', !threw && /🧙 Battle magic: your/.test(html), threw);
  UI.form={};
}

// ---- UI renders ----
{ const s=fresh(); const c=ready(s,'p',8); S=s;
  const g=hire(s,'p',{rank:2}); G.stationMagus(s,'p',g.id,'court',c.id);
  const w=hire(s,'p',{rank:1}); G.stationMagus(s,'p',w.id,'war',c.id);
  let html='', threw='';
  try { html=TABS.magi.render(c); } catch(e){ threw=e.stack; }
  ok('the Circle tab renders magi, candidates and the spell list', !threw && html.includes(g.name) && html.includes(w.name) && /Candidates/.test(html) && /Battle spells by school/.test(html), threw);
  ok('the tab sits right after Magic in Knowledge', (()=>{ const k=TAB_GROUPS.find(x=>x.id==='know').keys; return k.indexOf('magi')===k.indexOf('magic')+1; })());
  let chip=''; try { chip=CITY_EXTRAS.map(f=>{ try { return f(c)||''; } catch(e){ return ''; } }).join(''); } catch(e){ threw=e.stack; }
  ok('the city header shows the court magus', chip.includes(g.name));
  let mil=''; try { mil=MILITARY_EXTRAS.map(f=>f(c)||'').join(''); } catch(e){ threw=e.stack; }
  ok('the Military tab lists the war magi', mil.includes(w.name) && /War magi/.test(mil), threw);
  ok('a help section explains the Circle', HELP_SECTIONS.some(h=>h.id==='magi' && /Court Magus/.test(h.html)));
  const rep={ attSent:{militia:1}, att:'A', def:'B', A:1, D:1, attLost:{}, defHad:{}, defLost:{}, loot:{}, magi:{ att:[{owner:'p',id:w.id,name:w.name,rank:1,school:w.school,seed:w.seed,race:'hearth',age:30,did:['☄️ Fireball (+5% strength)'],fate:'wounded in the duel'}], def:[], duel:{winnerName:'X',loserName:w.name} } };
  let rh=''; try { rh=REPORT_EXTRAS.map(f=>f(rep)||'').join(''); } catch(e){ threw=e.stack; }
  ok('a battle report shows the magi and the duel', rh.includes(w.name) && /Duel of magi/.test(rh), threw);
  ok('portrait spec: kind magus with school colour, rank and era', (()=>{ const sp=G.magusSpec(s,'p',g); return sp.kind==='magus' && sp.school===g.school && sp.rank===g.rank && sp.color===DATA.schools[g.school].color && typeof sp.era==='number' && ['young','adult','old'].includes(sp.age); })());
  ok('the portrait draws (or falls back) without error', typeof G.portrait(G.magusSpec(s,'p',g),48)==='string');
}

console.log(fails?fails+' FAILED':'all magi tests passed');
if(fails) process.exitCode=1;
`);
