// Happiness, tax policy, culture, traditions and revolts.  node tests/culture.js
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=['js/data.js','js/engine.js','js/research.js',...['js/forge.js'].filter(f=>fs.existsSync(f)),'js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/wonders.js'];
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
let fails=0;
const ok=(name,cond,extra)=>{ if(!cond) fails++; console.log((cond?'PASS ':'FAIL ')+name+(extra?' '+extra:'')); };
const fresh=(race='hearth')=>{ const s=G.newGame({name:'T',race}); s.settings.hostility=0; s.calamityAt=1e12; s.eventAt=1e12; return s; };
const paceMin12=s=>12*60*G.pace(s).time+1;
const H=(s,c)=>G.happiness(s,c).value;
const factor=(s,c,re)=>(G.happiness(s,c).why.find(w=>re.test(w.label))||{}).value||0;

// ---- buildings registered ----
ok('culture buildings registered', ['tavern','temple','theatre'].every(b=>DATA.buildings[b]&&DATA.buildingOrder.includes(b)) && DATA.buildingGroups.some(g=>g.name==='Culture'));

// ---- each factor moves happiness ----
{ const s=fresh(); const c=G.capital(s,'p'); delete c.units.hero; c.res.bread=0; c.pop=5;
  const h0=H(s,c);
  ok('base ~55', h0===55, 'got '+h0+' '+JSON.stringify(G.happiness(s,c).why));
  c.buildings.tavern=3; const h1=H(s,c); ok('tavern raises happiness', h1===h0+9, h0+' -> '+h1);
  c.buildings.temple=2; c.buildings.theatre=2; ok('temple + theatre add more', H(s,c)===h1+4+3, ''+H(s,c));
  c.buildings.tavern=10; c.buildings.temple=10; c.buildings.theatre=10; ok('amenities capped', factor(s,c,/Taverns/)===G.CULTURE.amenityCap);
  c.buildings.tavern=0; c.buildings.temple=0; c.buildings.theatre=0;
  c.res.bread=50; ok('bread lifts Hearthfolk', H(s,c)===h0+8, ''+H(s,c)); c.res.bread=0;
  c.units.hero=1; ok('hero present', H(s,c)===h0+5); delete c.units.hero;
  c.mods=[{key:'popGrowth',mult:1.5,until:s.time+600,label:'Festival'},{key:'tax',mult:1.2,until:s.time+600,label:'Festival'}];
  ok('festival counts once', H(s,c)===h0+10, ''+H(s,c)); c.mods=[];
  const e=G.econ(s,c); c.pop=e.civCap; ok('crowding at full housing', factor(s,c,/Crowding/)<=-7, ''+factor(s,c,/Crowding/));
  c.pop=40; c.units.militia=40; ok('war weariness from soldiers', factor(s,c,/weariness/)<-10, ''+factor(s,c,/weariness/)); c.units={}; c.pop=5;
  for(let i=0;i<4;i++){ const t=G.freeTile(s,x=>G.dist(x,c)>4); G.foundCity(s,'p',t.x,t.y,'X'+i); }
  ok('empire size: 5 cities = -8', factor(s,c,/Empire size/)===-8, ''+factor(s,c,/Empire size/));
  s.empires.p.cultureTotal=G.CULTURE.sizeCulture*2; ok('culture softens empire size', factor(s,c,/Empire size/)===-4, ''+factor(s,c,/Empire size/));
  s.empires.p.cultureTotal=1e9; ok('softening is capped', factor(s,c,/Empire size/)===-2, ''+factor(s,c,/Empire size/));
  c.starving=true; ok('famine', factor(s,c,/Famine/)===-15); c.starving=false;
  G.startCalamity(s,'blight',G.tileAt(s,c.x,c.y)); ok('bad calamity', factor(s,c,/Calamity/)===-8); s.calamities=[];
  G.startCalamity(s,'feybloom',G.tileAt(s,c.x,c.y)); ok('good calamity does not upset', factor(s,c,/Calamity/)===0); s.calamities=[];
  c.lastHit={t:s.time,lost:true}; ok('recently sacked', factor(s,c,/sacked/)===-12);
  s.time+=601*G.pace(s).time; ok('raid memory fades', factor(s,c,/sacked|attacked/)===0);
}

// ---- tax policy ----
{ const s=fresh(); const c=G.capital(s,'p'); c.pop=60;
  const t0=G.econ(s,c).tax, h0=H(s,c);
  G.setTaxPolicy(s,c.id,'low'); const tl=G.econ(s,c).tax, hl=H(s,c);
  G.setTaxPolicy(s,c.id,'high'); const th=G.econ(s,c).tax, hh=H(s,c);
  ok('low tax: -30% tax, +10 happy', Math.abs(tl/t0-0.7)<0.01 && hl===h0+10, (tl/t0).toFixed(2)+' '+h0+'->'+hl);
  ok('high tax: +35% tax, -15 happy', Math.abs(th/t0-1.35)<0.01 && hh===h0-15, (th/t0).toFixed(2)+' '+h0+'->'+hh);
  ok('bad policy rejected', !!G.setTaxPolicy(s,c.id,'robbery'));
}

// ---- mood effects through G.mod ----
{ const s=fresh(); const c=G.capital(s,'p');
  const m=k=>G.mod(s,'p',c,k);
  c.happy=60; const g0=m('grain'), r0=m('refine'), p0=m('popGrowth'), t0=m('tax');
  c.happy=80; ok('jubilant: +10% goods/refine, +15% growth', Math.abs(m('grain')/g0-1.1)<1e-9 && Math.abs(m('refine')/r0-1.1)<1e-9 && Math.abs(m('popGrowth')/p0-1.15)<1e-9);
  c.happy=30; ok('discontent: -10% goods, -20% growth', Math.abs(m('ore')/G.mod(s,'p',Object.assign({},c,{happy:60}),'ore')-0.9)<1e-9 && Math.abs(m('popGrowth')/p0-0.8)<1e-9);
  c.happy=10; ok('unrest: -25% goods, -50% taxes', Math.abs(m('grain')/g0-0.75)<1e-9 && Math.abs(m('tax')/t0-0.5)<1e-9);
  c.happy=60; ok('neutral band has no effect', m('grain')===g0 && m('tax')===t0);
}

// ---- culture accrues ----
{ const s=fresh(); const c=G.capital(s,'p'); const r0=G.cultureRate(s,c);
  c.buildings.temple=2; c.buildings.theatre=1; const r1=G.cultureRate(s,c);
  ok('temples and theatres make culture', r1-r0>6.9, r0.toFixed(2)+' -> '+r1.toFixed(2));
  const before=s.empires.p.culture; G.advance(s,600,60);
  ok('culture accumulates', s.empires.p.culture>before+50 && s.empires.p.cultureTotal>=s.empires.p.culture, s.empires.p.culture.toFixed(0));
  ok('happiness stored with breakdown', typeof c.happy==='number' && Array.isArray(c.happyWhy) && c.happyWhy.length>0);
}

// ---- traditions ----
{ const s=fresh(); const c=G.capital(s,'p'); const emp=s.empires.p;
  ok('race tree: 4 shared + 4 own', G.traditionsFor(s,'p').length===8 && G.traditionsFor(s,'p').every(id=>!DATA.traditions[id].race||DATA.traditions[id].race==='hearth'));
  ok('other race tradition refused', !!G.adoptTradition(s,'p','ancestors'));
  ok('cannot adopt without culture', !!G.adoptTradition(s,'p','criers'));
  emp.culture=1e6;
  ok('tier 3 locked at start', !!G.adoptTradition(s,'p','hearthoath'));
  const cost0=G.traditionCost(s,'p'); const h0=H(s,c); const c0=emp.culture;
  ok('adopt Town Criers', G.adoptTradition(s,'p','criers')===null && H(s,c)===h0+4 && emp.culture===c0-cost0, 'cost '+cost0);
  ok('costs escalate', G.traditionCost(s,'p')>cost0, ''+G.traditionCost(s,'p'));
  ok('no double adoption', !!G.adoptTradition(s,'p','criers'));
  const g0=G.mod(s,'p',c,'grain'); G.adoptTradition(s,'p','harvest');
  ok('Harvest Festivals: +10% grain', Math.abs(G.mod(s,'p',c,'grain')/g0-1.1)<1e-9);
  c.res.bread=10; ok('Harvest Festivals: bread worth +13', factor(s,c,/bread/)===13); c.res.bread=0;
  const t0=G.mod(s,'p',c,'tax'); G.adoptTradition(s,'p','guilds'); ok('Guild Charters: +10% tax', Math.abs(G.mod(s,'p',c,'tax')/t0-1.1)<1e-9);
  ok('tier 3 unlocks after 3', G.adoptTradition(s,'p','hearthoath')===null);
  const a0=G.mod(s,'p',null,'atk');
  const s2=fresh('ash'); s2.empires.p.culture=1e6; const a1=G.mod(s2,'p',null,'atk'); G.adoptTradition(s2,'p','bloodfeast');
  ok('Blood Feasts: empire-wide +5% attack (city=null)', Math.abs(G.mod(s2,'p',null,'atk')/a1-1.05)<1e-9);
  const c2=G.capital(s2,'p'); c2.pop=40; c2.units.raider=40; const w=factor(s2,c2,/weariness/);
  s2.empires.p.traditions=[]; const w0=factor(s2,c2,/weariness/);
  ok('Blood Feasts halves war weariness', Math.abs(w-w0/2)<=1, w0+' -> '+w);
}

// ---- unrest, warning, placate, revolt ----
{ const s=fresh(); const cap=G.capital(s,'p');
  const t=G.freeTile(s,x=>G.dist(x,cap)>4&&G.dist(x,cap)<8); const c=G.foundCity(s,'p',t.x,t.y,'Rebelton');
  c.units.militia=30; c.pop=10; c.taxPolicy='high'; c.starving=true; c.lastHit={t:s.time,lost:true};
  G.advance(s,10,1);
  ok('city in unrest', c.happy<20, 'happy '+c.happy);
  ok('player warned with a decision', (s.pending||[]).some(p=>p.kind==='unrest'&&p.data.city===c.id) && s.log.some(l=>/Unrest in Rebelton/.test(l.text)));
  const l0=c.loyalty; G.advance(s,120,12); c.starving=true; c.lastHit={t:s.time,lost:true};
  ok('loyalty falls ~1/min', l0-c.loyalty>1.5 && l0-c.loyalty<3, (l0-c.loyalty).toFixed(2)+' over 2 min');
  s.empires.p.gold=1e5; const p=s.pending.find(p=>p.kind==='unrest');
  ok('placate via decision', G.resolvePending(s,p.id,'placate')===null && c.placated>s.time && factor(s,c,/circuses/)===25);
  c.placated=0; s.time+=paceMin12(s); G.advance(s,10,1);
  ok('unrest warning repeats while unrest lasts', s.pending.some(p=>p.kind==='unrest'&&p.data.city===c.id));
  ok('placating from the Culture tab clears the decision', G.placate(s,c.id)===null && !s.pending.some(p=>p.kind==='unrest'&&p.data.city===c.id));
  c.placated=0; c.loyalty=0.1; c.starving=true; c.lastHit={t:s.time,lost:true};
  const before=Object.keys(s.camps).length;
  G.advance(s,10,1);
  const tile=G.tileAt(s,t.x,t.y);
  ok('revolt removes the city', !s.cities[c.id] && !tile.city, 'cities '+G.citiesOf(s,'p').length);
  ok('revolt leaves a strong brigand camp', tile.camp && s.camps[tile.camp] && s.camps[tile.camp].tier>=4 && Object.keys(s.camps).length===before+1, tile.camp&&JSON.stringify(s.camps[tile.camp].units));
  // last city never revolts
  cap.happy=0; cap.taxPolicy='high'; cap.starving=true; cap.loyalty=0.1; cap.units.militia=60; cap.pop=10; cap.lastHit={t:s.time,lost:true};
  G.advance(s,10,1);
  ok('last city never revolts', !!s.cities[cap.id] && !s.gameOver, 'loyalty '+cap.loyalty);
}

// ---- AI reacts ----
{ const s=fresh(); const ai=G.citiesOf(s,'a1')[0]; const emp=s.empires.a1;
  ai.buildings.townhall=5; ai.res.timber=5000; ai.res.stone=5000; ai.res.grain=5000; emp.gold=5000;
  ai.taxPolicy='normal'; ai.starving=true; ai.lastHit={t:s.time,lost:true}; ai.units[DATA.races[emp.race].units[0]]=40; ai.pop=20;
  G.updateHappiness(s,ai);
  for(const h of G.aiHooks) h(s,emp,0.2);
  ok('AI lowers taxes and builds amenities when unhappy', ai.taxPolicy==='low' && ai.buildQueue.some(q=>['tavern','temple','theatre'].includes(q.type)), ai.taxPolicy+' '+ai.buildQueue.map(q=>q.type));
  ai.starving=false; ai.lastHit=null; ai.units={}; ai.buildings.tavern=10; ai.buildings.temple=5; ai.pop=10; G.updateHappiness(s,ai);
  for(const h of G.aiHooks) h(s,emp,0.2); for(const h of G.aiHooks) h(s,emp,0.2);
  ok('AI raises taxes when content', ai.taxPolicy==='high', ai.taxPolicy+' happy '+ai.happy);
  emp.culture=5000; for(const h of G.aiHooks) h(s,emp,0.2);
  ok('AI adopts traditions', (emp.traditions||[]).length>=1, JSON.stringify(emp.traditions));
}

// ---- save / load ----
{ const s=fresh(); const c=G.capital(s,'p'); s.empires.p.culture=1234; s.empires.p.cultureTotal=5678; s.empires.p.traditions=['criers'];
  c.taxPolicy='low'; G.updateHappiness(s,c); const h=c.happy;
  G.save(s); const s2=G.load(); const c2=s2.cities[c.id];
  ok('save/load keeps culture state', s2.empires.p.culture===1234 && s2.empires.p.cultureTotal===5678 && s2.empires.p.traditions[0]==='criers' && c2.taxPolicy==='low' && c2.happy===h);
  G.advance(s2,300,30); ok('loaded game runs', s2.empires.p.culture>1234);
}
console.log(fails?fails+' FAILED':'all culture checks passed');
if(fails) process.exitCode=1;
`);
