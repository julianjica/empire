// usage: node tests/sim.js [pace] [hours] [basic|army] [old]
//   the bot builds, settles and (army) raids camps; unless 'old' is given it also casts economic spells,
//   founds or adopts a faith and opens trade routes, so the bot-vs-AI comparison covers those systems
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const pace=process.argv[2]||'standard', hours=+(process.argv[3]||4), bot=process.argv[4]||'basic', smart=process.argv[5]!=='old';
const files=['js/data.js','js/races2.js','js/engine.js',...['js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/espionage.js','js/minors.js','js/chronicle.js'].filter(f=>fs.existsSync(f)).filter(f=>fs.existsSync(f))];
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
const s=G.newGame({name:'Test',race:'hearth',pace});
const t0=Date.now();
const unit0=DATA.races.hearth.units[0];
const B={casts:0,faith:'',routes:0};
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
for(let m=0;m<hours*60;m++){
  for(let i=0;i<6;i++){
    for(const c of G.citiesOf(s,'p')){
      if(c.buildQueue.length<2){const ok=DATA.buildingOrder.filter(t=>G.buildStatus(s,c,t).ok).sort((a,b)=>G.lvl(c,a)-G.lvl(c,b)); if(ok[0]) G.queueBuild(s,c.id,ok[0]);}
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
    G.advance(s,10,5);
  }
  if(smart){ botMagic(); botFaith(); botTrade(); }
  if((m+1)%60==0){
    const out=Object.values(s.empires).map(e=>e.name.slice(0,10)+': c'+G.citiesOf(s,e.id).length+' r'+G.renown(s,e.id)+' pow'+G.power(s,e.id)+(e.dead?' DEAD':''));
    const raids=s.reports.filter(r=>r.owners.includes('p')&&!r.title.includes('brigand')&&r.owners[0]!=='p').length;
    console.log('h'+(m+1)/60, out.join(' | '), '| raids on p:',raids);
    if((m+1)/60===hours){
      const pc=G.citiesOf(s,'p'), ais=Object.values(s.empires).filter(e=>e.id!=='p');
      const aiAvg=Math.round(ais.reduce((a,e)=>a+G.renown(s,e.id),0)/ais.length);
      console.log('bot: renown',G.renown(s,'p'),'vs AI avg',aiAvg,'('+Math.round(G.renown(s,'p')/aiAvg*100)+'%) | raids on p',raids,'| mage tower max',Math.max(0,...pc.map(c=>G.lvl(c,'magetower'))),'spells',B.casts,'| faith',s.empires.p.faithId?(B.faith||'yes'):'none','| routes opened',B.routes,'active',G.routes?G.routes(s).filter(r=>r.owner==='p'&&r.active).length:0,'trade gold',Math.round(s.empires.p.tradeIncome||0),smart?'':'(old bot)');
    }
  }
}
G.save(s); const s2=G.load(); G.advance(s2,600); console.log('save/load ok:', !!s2 && !!s2.special.find(t=>t.oasis), 'special', s2.special.length);
console.log('sim ms', Date.now()-t0, 'moves', s.moves.length, 'camps', Object.keys(s.camps).length);
`);
