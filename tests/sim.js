// usage: node sim.js [pace] [hours] [files...]
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const pace=process.argv[2]||'standard', hours=+(process.argv[3]||4), bot=process.argv[4]||'basic';
const files=['js/data.js','js/races2.js','js/engine.js',...['js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/espionage.js','js/minors.js','js/chronicle.js'].filter(f=>fs.existsSync(f)).filter(f=>fs.existsSync(f))];
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
const s=G.newGame({name:'Test',race:'hearth',pace});
const t0=Date.now();
const unit0=DATA.races.hearth.units[0];
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
  if((m+1)%60==0){
    const out=Object.values(s.empires).map(e=>e.name.slice(0,10)+': c'+G.citiesOf(s,e.id).length+' r'+G.renown(s,e.id)+' pow'+G.power(s,e.id)+(e.dead?' DEAD':''));
    const raids=s.reports.filter(r=>r.owners.includes('p')&&!r.title.includes('brigand')&&r.owners[0]!=='p').length;
    console.log('h'+(m+1)/60, out.join(' | '), '| raids on p:',raids);
  }
}
G.save(s); const s2=G.load(); G.advance(s2,600); console.log('save/load ok:', !!s2 && !!s2.special.find(t=>t.oasis), 'special', s2.special.length);
console.log('sim ms', Date.now()-t0, 'moves', s.moves.length, 'camps', Object.keys(s.camps).length);
`);
