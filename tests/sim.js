// usage: node tests/sim.js [pace] [hours] [basic|army] [old|prev] [--seed=N]
//   the bot builds, settles and (army) raids camps; unless 'old' is given it also casts economic spells,
//   founds or adopts a faith and opens trade routes, so the bot-vs-AI comparison covers those systems.
//   Unless 'old' or 'prev' is given it also plays the newer systems as the AI does: parallel research
//   (filling every study slot and keeping a queue), Grimoire study, enchantments and defensive casts,
//   the Circle of Magi (recruit and post), auto-supply, moving troops to a threatened city and
//   intercepting an attack when clearly stronger.
//   'prev' is the bot before those (for before/after comparisons on the same seed).
//   --gov=half|newest|late|noncap|all[:focus[:nomarket[:reserve[:noq]]]] hands some cities to governors that think
//   for the realm (half = every second city after the capital, noncap = all but the capital; noq = no quarters).
//   Off by default. Over 24 seeds (renown share vs the AI average) governors on every city beat the bot's own
//   picker by about +17 (12h basic) to +56 (12h army) points, and governors on all but the capital by +10 to +22.
//   --stats prints per-city diagnostics (idle builders, governors' market gold, what was built, waits) as STATS lines;
//   --council=key=v,... tunes G.COUNCIL for experiments.
//   --off=research,arcana,magi,govern,defend leaves parts out; --rs=0.5 paces research (see RES_SHARE).
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const args=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const pace=args[0]||'standard', hours=+(args[1]||4), bot=args[2]||'basic', smart=args[3]!=='old', modern=smart&&args[3]!=='prev';
// --seed=N makes a run reproducible (the same world and the same dice), for before/after comparisons
const seedArg=(process.argv.find(a=>a.startsWith('--seed='))||'').split('=')[1];
if(seedArg!==undefined){ let a=+seedArg|0; Math.random=()=>{ a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const files=['js/data.js','js/races2.js','js/engine.js',...['js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/roads.js','js/quarters.js','js/intercept.js','js/warplan.js','js/automation.js','js/dynasty.js'].filter(f=>fs.existsSync(f)).filter(f=>fs.existsSync(f))];
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
const s=G.newGame({name:'Test',race:'hearth',pace});
// --council=key=v,key=v tunes G.COUNCIL (for governor experiments)
for(const kv of ((process.argv.find(a=>a.startsWith('--council='))||'').slice(10)).split(',').filter(Boolean)){ const [k,v]=kv.split('='); G.COUNCIL[k]=+v; }
const t0=Date.now();
const unit0=DATA.races.hearth.units[0];
const B={casts:0,faith:'',routes:0};
// --stats prints per-city diagnostics (idle builders, market gold, what was built, waits) as STATS lines
const STATS=process.argv.includes('--stats');
const ST={idle:{gov:0,bot:0},ticks:{gov:0,bot:0},mkt:{buy:0,sell:0},built:{gov:{},bot:{}},waits:{},govOn:false,qGov:0};
if(STATS){
  const qb=G.queueBuild; G.queueBuild=(s2,cid,t)=>{ const r=qb(s2,cid,t); if(r===null&&s2.cities[cid].owner==='p'){ const k=ST.govOn?'gov':'bot'; ST.built[k][t]=(ST.built[k][t]||0)+1; } return r; };
  const tr=G.trade; G.trade=(s2,cid,g,n,dir)=>{ const gold0=s2.empires.p.gold; const r=tr(s2,cid,g,n,dir); if(ST.govOn&&s2.cities[cid]&&s2.cities[cid].owner==='p'){ const d=s2.empires.p.gold-gold0; if(d<0) ST.mkt.buy-=d; else ST.mkt.sell+=d; } return r; };
  const cg=G.councilGovern; G.councilGovern=s2=>{ ST.govOn=true; try{ return cg(s2); } finally{ ST.govOn=false; } };
}
const ECON=new Set(['grain','timber','stone','ore','raw','refine','buildTime','tax','popGrowth','housing']);
// spells: any city/realm spell whose effects are economic, cast on the most populous city
const botMagic=()=>{
  if(!G.spellsOf||!G.castSpell) return;
  const cs=G.citiesOf(s,'p'); if(!cs.length) return;
  const towers=cs.filter(c=>G.lvl(c,'magetower')>0).sort((a,b)=>G.lvl(b,'magetower')-G.lvl(a,'magetower'));
  if(!towers.length) return;
  const big=cs.slice().sort((a,b)=>b.pop-a.pop)[0];
  for(const id of G.spellsOf(s,'p')){
    const sp=DATA.spells[id];
    if(!(sp.target==='city'||sp.target==='realm')||!(sp.fx||[]).some(f=>ECON.has(f.key))) continue;
    const from=towers.find(c=>G.spellStatus(s,'p',c.id,id).ok); if(!from) continue;
    if(G.castSpell(s,'p',from.id,id,sp.target==='city'?big.id:undefined)===null) B.casts++;
  }
};
// faith: found one as soon as a temple and enough faith allow; otherwise adopt the most widespread after a while
const botFaith=()=>{
  if(!G.foundStatus) return;
  const emp=s.empires.p;
  if(emp.faithId) return;
  if(G.foundStatus(s,'p').ok){ if(G.foundFaith(s,'p',G.aiFounding(s,emp))===null) B.faith='founded'; return; }
  const fs=Object.values(s.faiths||{});
  if(fs.length && s.time>3*3600*G.pace(s).time){
    const by=G.faithWorld?G.faithWorld(s).by:{};
    const f=fs.sort((a,b)=>(by[b.id]||0)-(by[a.id]||0))[0];
    if(G.adoptStatus(s,'p',f.id).ok && G.adoptFaith(s,'p',f.id)===null) B.faith='adopted';
  }
};
// trade: fill free route slots: a foreign partner when one is known and willing, else feed a needy city of our own
const botTrade=()=>{
  if(!G.createRoute) return;
  const raw=['grain','timber','stone','ore'];
  for(const c of G.citiesOf(s,'p')){
    if(G.lvl(c,'market')<1||G.routesFrom(s,c.id).length>=G.routeSlots(s,c)) continue;
    const cap=G.storageCap(s,c), give=raw.slice().sort((a,b)=>(c.res[b]||0)-(c.res[a]||0))[0];
    if((c.res[give]||0)<cap*0.4) continue;
    const n=Math.max(20,Math.min(G.caravanCap(s,c),Math.floor(c.res[give]*0.25)));
    const used=new Set(G.routes(s).filter(r=>r.owner==='p').map(r=>r.to.id));
    const foreign=G.routeTargets(s,'p').filter(t=>!used.has(t.id)&&G.landReachable(s,c,t)).sort((a,b)=>G.dist(a,c)-G.dist(b,c));
    let r=null;
    for(const t of foreign.slice(0,3)){
      const take=G.routeTakeGoods(s,'p',t.owner).filter(g=>g!==give).sort((a,b)=>(c.res[a]||0)/(DATA.goods[a].value||1)-(c.res[b]||0)/(DATA.goods[b].value||1))[0];
      r=G.createRoute(s,'p',c.id,t.id,{give:{[give]:n},takeGood:take});
      if(typeof r==='object') break;
    }
    if(typeof r!=='object'||!r){
      const needy=G.citiesOf(s,'p').filter(o=>o!==c&&!used.has(o.id)&&(o.res[give]||0)<G.storageCap(s,o)*0.25&&G.landReachable(s,c,o)).sort((a,b)=>G.dist(a,c)-G.dist(b,c))[0];
      if(needy) r=G.createRoute(s,'p',c.id,needy.id,{give:{[give]:n}});
    }
    if(r&&typeof r==='object') B.routes++;
  }
};
// ---- the newer systems, through the same public APIs the player's UI uses ----
const P=()=>s.empires.p;
const HOSTILE=new Set(['raid','attack','conquer']);
// a topic starts only when each of its goods is at most this share of what the city (or treasury) holds
const RES_SHARE=+((process.argv.find(a=>a.startsWith('--rs='))||'').split('=')[1]||0.5);
const N={techs:0,studies:0,ench:0,defcasts:0,magi:0,posts:0,govs:0,reinf:0,icSent:0,icSkipped:0};
// research: fill every free study slot (the AI's own pick), and keep a couple of recommended topics queued
const botResearch=()=>{
  if(!G.researchSlots) return;
  // one new topic a minute at most, and only from a surplus, so research never starves construction
  if(G.researchSlots(s,'p').free>0){
    const pick=G.aiResearchPick(s,P());
    const cost=pick&&G.techStatus(s,pick.city.id,pick.id).cost, cheap=cost&&Object.entries(cost).every(([g,v])=>g==='gold'?P().gold*RES_SHARE>=v:(pick.city.res[g]||0)*RES_SHARE>=v);
    if(pick && cheap && G.startResearch(s,pick.city.id,pick.id)===null) N.techs++;
  }
  // a standing queue only once there are parallel slots (the engine starts queued topics whenever a slot frees,
  // whatever the stores, which starves construction early on but pays off later)
  const R=G.research(s,'p'), sl=G.researchSlots(s,'p');
  if(sl.total>=2 && (R.queue||[]).length<2 && sl.total>R.studies.length+(R.queue||[]).length){
    for(const id of G.techRecommend(s,'p',3)) if(!(R.queue||[]).includes(id) && G.queueResearch(s,'p',id)===null) break;
  }
};
// the Grimoire: study what the AI would; keep an enchantment where the tower can feed it; ward a threatened city
const botArcana=()=>{
  if(!G.grimoire) return;
  const towers=G.citiesOf(s,'p').filter(c=>G.lvl(c,'magetower')>0);
  if(!towers.length) return;
  const A=G.grimoire(s,'p');
  if(!A.active){ const id=G.aiStudyPick(s,P()); if(id && G.startStudy(s,'p',id)===null) N.studies++; }
  const known=G.enchantmentsKnown(s,'p');
  for(const c of towers){
    if(!known.length || (c.ench||[]).length>=G.enchantSlots(s,c)) continue;
    const net=G.econ(s,c).net.mana||0;
    const pick=known.find(k=>!G.hasEnchantment(c,k) && G.enchantStatus(s,'p',c.id,k).ok && G.manaOf(s,'p')>G.enchantCost(s,'p',k).mana*2 && net>2);
    if(pick && G.enchantCity(s,'p',c.id,pick)===null){ N.ench++; break; }
  }
  const best=towers.sort((a,b)=>G.lvl(b,'magetower')-G.lvl(a,'magetower'))[0];
  const hit=s.moves.find(m=>m.owner!=='p' && HOSTILE.has(m.type) && (()=>{ const t=G.tileAt(s,m.x,m.y); return t.city && s.cities[t.city].owner==='p'; })());
  if(hit){
    const t=G.tileAt(s,hit.x,hit.y);
    for(const id of G.spellsOf(s,'p')){ const sp=DATA.spells[id]; if(sp.ai!=='defend') continue; const st=G.spellStatus(s,'p',best.id,id); if(!st.ok || G.manaOf(s,'p')<st.cost*1.6) continue; if(G.castSpell(s,'p',best.id,id,sp.target==='city'?t.city:undefined)===null){ N.defcasts++; break; } }
  }
};
// the Circle of Magi: recruit the best candidate when gold and mana allow; post idle magi (court, war, study)
const soldiers=u=>Object.entries(u||{}).reduce((a,[k,n])=>a+(DATA.units[k]&&!['settlers','herald','scout','hero'].includes(k)&&DATA.units[k].type!=='civ'?n:0),0);
const botMagi=()=>{
  if(!G.magiCap || !G.magiCap(s,'p')) return;
  const list=G.magiOf(s,'p');
  for(const g of list) if(g.loyalty<35 && P().gold>G.honorCost(g).gold*3) G.honorMagus(s,'p',g.id);
  if(list.length<G.magiCap(s,'p')){
    const pool=G.magiPool(s,'p');
    const best=pool.list.map((c,i)=>({c,i})).sort((a,b)=>b.c.rank-a.c.rank)[0];
    if(best){ const cost=G.magiRecruitCost(s,'p',best.c.rank); if(P().gold>cost.gold*2.5 && G.manaOf(s,'p')>cost.mana*2+100 && G.recruitMagus(s,'p',best.i)===null) N.magi++; }
  }
  const cities=G.citiesOf(s,'p');
  const towers=cities.filter(c=>G.lvl(c,'magetower')>0).sort((a,b)=>G.lvl(b,'magetower')-G.lvl(a,'magetower'));
  const hub=cities.slice().sort((a,b)=>soldiers(b.units)-soldiers(a.units))[0];
  for(const g of G.magiOf(s,'p')){
    if(g.status!=='home' || g.station!=='idle') continue;
    const courtless=towers.find(c=>!G.courtMagusOf(s,c));
    const all=G.magiOf(s,'p'), war=all.filter(x=>x.station==='war').length;
    let e='none';
    if(courtless && all.filter(x=>x.station==='court').length<=war) e=G.stationMagus(s,'p',g.id,'court',courtless.id);
    else if(bot==='army' && hub && soldiers(hub.units)>=10 && war<Math.ceil(all.length/2)) e=G.stationMagus(s,'p',g.id,'war',hub.id);
    else if(towers[0]) e=G.stationMagus(s,'p',g.id,'study',towers[0].id);
    if(e===null) N.posts++;
  }
};
// governors: every second city beyond the capital runs itself, thinking for the realm; auto-supply stays on
const botGovern=()=>{
  if(!G.setGovernor) return;
  const cs=G.citiesOf(s,'p').slice().sort((a,b)=>(a.founded||0)-(b.founded||0));
  const GV=(process.argv.find(a=>a.startsWith('--gov='))||'--gov=none').split('=')[1].split(':');
  cs.forEach((c,i)=>{
    const want=GV[0]==='half'?(i>0&&i%2===0):GV[0]==='newest'?(cs.length>=3&&i===cs.length-1):GV[0]==='late'?(i>=3):GV[0]==='noncap'?(i>0):GV[0]==='all';
    if(want && !G.govOf(s,c.id) && G.setGovernor(s,c.id,{focus:GV[1]||'balanced',realm:true,reserve:+(GV[3]||200),market:GV[2]!=='nomarket'})===null){ N.govs++; if(GV[4]==='noq') s.council.gov[c.id].quarters=false; }
  });
  if(G.logistics){ const o=G.logistics(s,'p'); if(!o.on) G.setSupplyRealm(s,'p',{on:true,relief:true}); }
};
// defence: meet an attack in the field when clearly stronger; otherwise send troops from a sister city that arrive in time
const fieldOf=(c,keep)=>{ const out={}; for(const [u,n] of Object.entries(c.units||{})){ const d=DATA.units[u]; if(!d||!(n>0)||['settlers','herald','scout','hero'].includes(u)||d.type==='civ'||d.type==='ship') continue; const k=Math.floor(n*(1-keep)); if(k>0) out[u]=k; } return out; };
const helped=new Set();
const botDefend=()=>{
  const mine=G.citiesOf(s,'p'); if(mine.length===0) return;
  for(const m of s.moves.slice()){
    if(m.owner==='p' || !HOSTILE.has(m.type) || helped.has(m.id) || m.arrive-s.time<30) continue;
    const t=G.tileAt(s,m.x,m.y), c=t&&t.city&&s.cities[t.city]; if(!c||c.owner!=='p') continue;
    // intercept from the nearest few cities when the preview says we win clearly
    if(G.sendIntercept && !G.canIntercept(s,'p',m)){
      const p=G.movePos(s,m); let sent=false;
      for(const o of mine.slice().sort((a,b)=>G.dist(a,p)-G.dist(b,p)).slice(0,3)){
        const units=fieldOf(o,0.3); if(G.unitsCount(units)<10) continue;
        const pv=G.previewIntercept(s,o,m,units,null);
        if(!pv || !pv.win || pv.A<pv.D*1.6) continue;
        if(G.sendIntercept(s,o.id,m.id,units,null)===null){ N.icSent++; sent=true; break; }
      }
      if(sent){ helped.add(m.id); continue; }
      N.icSkipped++;
    }
    // reinforce when the garrison looks too weak
    const att=G.atkPower(s,m.owner,m.units||{}), def=G.defPower(s,'p',c.units)*(1+0.05*G.lvl(c,'wall'))+10+5*G.lvl(c,'townhall');
    if(def>=att*1.1) { helped.add(m.id); continue; }
    for(const o of mine){
      if(o===c) continue;
      const units=fieldOf(o,0.4); if(G.unitsCount(units)<5) continue;
      const tt=G.travelTime(s,'p',o,c,G.slowest(s,'p',units));
      if(s.time+tt>=m.arrive-5) continue;
      if(G.sendArmy(s,o.id,c.x,c.y,'reinforce',units)===null){ N.reinf++; helped.add(m.id); break; }
    }
  }
};
// --off=research,arcana,magi,govern,defend leaves parts out (to measure what each is worth)
const OFF=((process.argv.find(a=>a.startsWith('--off='))||'').split('=')[1]||'').split(',');
const botModern=()=>{ for(const f of [botResearch,botArcana,botMagi,botGovern,botDefend].filter(f=>!OFF.includes(f.name.slice(3).toLowerCase()))){ try{ f(); }catch(e){ console.error('bot',f.name,e.message); } } };
for(let m=0;m<hours*60;m++){
  for(let i=0;i<6;i++){
    for(const c of G.citiesOf(s,'p')){
      if(c.buildQueue.length<2 && !(modern&&G.govOf&&G.govOf(s,c.id))){const ok=DATA.buildingOrder.filter(t=>G.buildStatus(s,c,t).ok).sort((a,b)=>G.lvl(c,a)-G.lvl(c,b)); if(ok[0]) G.queueBuild(s,c.id,ok[0]);}
      if(G.canFoundCity(s,'p') && G.lvl(c,'townhall')>=5){
        if((c.units.settlers||0)>0){ const t=G.freeTile(s,x=>G.dist(x,c)>=3&&G.dist(x,c)<=6&&Object.values(s.cities).every(o=>G.dist(o,x)>=2.8)); if(t) G.sendArmy(s,c.id,t.x,t.y,'settle',{settlers:1}); }
        else if(!(c.train.townhall||[]).length) G.queueTrain(s,c.id,'settlers',1);
      }
      if(bot==='army'){
        if(!(c.train.barracks||[]).length && G.lvl(c,'barracks')>0){ const n=Math.min(10,G.maxAffordable(s,c,DATA.units[unit0].cost)); if(n>=3 && (c.res.grain>300)) G.queueTrain(s,c.id,unit0,n); }
        const n=c.units[unit0]||0;
        if(n>=20 && !s.moves.some(m=>m.owner==='p')){ const camp=Object.values(s.camps).filter(k=>G.defPower(s,null,k.units)*1.5<n*15).sort((a,b)=>G.dist(a,c)-G.dist(b,c))[0]; if(camp) G.sendArmy(s,c.id,camp.x,camp.y,'raid',{[unit0]:Math.floor(n*0.6)}); }
      }
    }
    if(STATS) for(const c of G.citiesOf(s,'p')){ const gv=G.govOf&&G.govOf(s,c.id); const k=gv?'gov':'bot'; ST.ticks[k]++; if(!c.buildQueue.length){ ST.idle[k]++; if(gv&&gv.wait){ const w=gv.wait.text.replace(/ for .*| \d+.*/,'')+(s.time-(c.founded||0)<3600?' (young)':''); ST.waits[w]=(ST.waits[w]||0)+1; } } }
    G.advance(s,10,5);
  }
  if(smart){ botMagic(); botFaith(); botTrade(); }
  if(modern) botModern();
  if(modern && bot==='army' && !OFF.includes('defend')) for(let k=0;k<2;k++) botDefend();
  if((m+1)%60==0){
    const out=Object.values(s.empires).map(e=>e.name.slice(0,10)+': c'+G.citiesOf(s,e.id).length+' r'+G.renown(s,e.id)+' pow'+G.power(s,e.id)+(e.dead?' DEAD':''));
    const raids=s.reports.filter(r=>r.owners.includes('p')&&!r.title.includes('brigand')&&r.owners[0]!=='p').length;
    console.log('h'+(m+1)/60, out.join(' | '), '| raids on p:',raids);
    if((m+1)/60===hours){
      const pc=G.citiesOf(s,'p'), ais=Object.values(s.empires).filter(e=>e.id!=='p');
      const aiAvg=Math.round(ais.reduce((a,e)=>a+G.renown(s,e.id),0)/ais.length);
      console.log('bot: renown',G.renown(s,'p'),'vs AI avg',aiAvg,'('+Math.round(G.renown(s,'p')/aiAvg*100)+'%) | raids on p',raids,'| mage tower max',Math.max(0,...pc.map(c=>G.lvl(c,'magetower'))),'spells',B.casts,'| faith',s.empires.p.faithId?(B.faith||'yes'):'none','| routes opened',B.routes,'active',G.routes?G.routes(s).filter(r=>r.owner==='p'&&r.active).length:0,'trade gold',Math.round(s.empires.p.tradeIncome||0),smart?(modern?'':'(prev bot)'):'(old bot)');
      const R=G.research(s,'p'), L=G.logistics?G.logistics(s,'p'):null;
      console.log('     techs known',Object.keys(R.done).length,'slots',G.researchSlots(s,'p').total,'| grimoire known',G.grimoire?G.grimoire(s,'p').known.length:0,'ench',pc.reduce((a,c)=>a+(c.ench||[]).length,0),
        '| magi',G.magiOf?G.magiOf(s,'p').length:0,'| governors',pc.filter(c=>G.govOf&&G.govOf(s,c.id)).length,'| supply trips',L&&L.stats?L.stats.trips:0,
        '| reinforcements',N.reinf,'interceptions',N.icSent,'| AI techs avg',Math.round(ais.reduce((a,e)=>a+Object.keys(G.research(s,e.id).done).length,0)/ais.length),
        'AI grimoire avg',G.grimoire?Math.round(ais.reduce((a,e)=>a+G.grimoire(s,e.id).known.length,0)/ais.length):0,'AI magi avg',G.magiOf?(ais.reduce((a,e)=>a+G.magiOf(s,e.id).length,0)/ais.length).toFixed(1):0);
    }
  }
}
if(STATS){
  const pc=G.citiesOf(s,'p');
  console.log('STATS idle gov',(ST.idle.gov/Math.max(1,ST.ticks.gov)).toFixed(3),'bot',(ST.idle.bot/Math.max(1,ST.ticks.bot)).toFixed(3),'| govMarket buy',Math.round(ST.mkt.buy),'sell',Math.round(ST.mkt.sell),'| waits',JSON.stringify(ST.waits));
  console.log('STATS builtGov',JSON.stringify(ST.built.gov));
  console.log('STATS builtBot',JSON.stringify(ST.built.bot));
  for(const c of pc.sort((a,b)=>(a.founded||0)-(b.founded||0))){ const e=G.econ(s,c); const lv=Object.values(c.buildings).reduce((a,b)=>a+b,0);
    console.log('STATS city',c.name.slice(0,10),'gov',!!(G.govOf&&G.govOf(s,c.id)),'founded',Math.round((c.founded||0)/60),'TH',G.lvl(c,'townhall'),'lv',lv,'wh',G.lvl(c,'warehouse'),'pop',Math.round(c.pop)+'/'+e.civCap,'eff',e.eff.toFixed(2),'q',c.buildQueue.length,'qtr',(c.quarters||[]).length,'grainNet',e.net.grain.toFixed(1)); }
  console.log('STATS gold',Math.round(s.empires.p.gold),'wins',s.empires.p.wins||0,'conq',s.empires.p.conquests||0,'levels',pc.reduce((a,c)=>a+Object.values(c.buildings).reduce((x,y)=>x+y,0),0),'cities',pc.length,'soldiers',pc.reduce((a,c)=>a+(c.units[unit0]||0),0),'raidsOnP',s.reports.filter(r=>r.owners.includes('p')&&!r.title.includes('brigand')&&r.owners[0]!=='p').length);
}
G.save(s); const s2=G.load(); G.advance(s2,600); console.log('save/load ok:', !!s2 && !!s2.special.find(t=>t.oasis), 'special', s2.special.length);
console.log('sim ms', Date.now()-t0, 'moves', s.moves.length, 'camps', Object.keys(s.camps).length);
`);
