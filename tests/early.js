const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const race=process.argv[2]||'hearth';
eval(['js/data.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/wonders.js'].map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
const s=G.newGame({name:'T',race});
let idle=0; const qt={};
const u0=DATA.races[race].units[0];
for(let t=0;t<4*3600;t+=10){
  for(const c of G.citiesOf(s,'p')){
    if(c.buildQueue.length<2){const ok=DATA.buildingOrder.filter(b=>G.buildStatus(s,c,b).ok).sort((a,b)=>G.lvl(c,a)-G.lvl(c,b)); if(ok[0]) G.queueBuild(s,c.id,ok[0]);}
    if(c.buildQueue.length===0 && t<1800) idle+=10;
    if(G.lvl(c,'barracks')&&!(c.train.barracks||[]).length){const n=Math.min(8,G.maxAffordable(s,c,DATA.units[u0].cost)); if(n>2) G.queueTrain(s,c.id,u0,n);}
  }
  const h=G.hero(s); if(h.free) G.heroAssign(s,'str');
  for(const q of DATA.quests) if(!qt[q.id] && q.check(s)) qt[q.id]=Math.round(t/60);
  G.advance(s,10,5);
  if(t===3600-10||t===4*3600-10){
    const c=G.capital(s,'p'); const e=G.econ(s,c);
    console.log('t='+(t+10)/60+'min', 'stock %cap:', visible().map(g=>g+':'+Math.round(c.res[g]/e.cap*100)+'%('+(e.net[g]>=0?'+':'')+e.net[g].toFixed(1)+')').join(' '));
    console.log('   buildings', JSON.stringify(c.buildings));
  }
}
function visible(){return DATA.goodOrder.filter(g=>!DATA.goods[g].race||DATA.goods[g].race===race);}
console.log('idle builder seconds in first 30 min:', idle);
console.log('quest minutes:', JSON.stringify(qt));
`);
