const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
eval(['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js'].filter(f=>fs.existsSync(f)).map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
const s=G.newGame({name:'T',race:'hearth'});
let conquerSent=0, heralds=0;
const orig=G.sendArmy; G.sendArmy=(...a)=>{ const r=orig(...a); if(!r&&a[4]==='conquer') conquerSent++; return r; };
for(let h=1;h<=12;h++){ G.advance(s,3600,800);
  heralds=Object.values(s.cities).reduce((x,c)=>x+(c.owner!=='p'?(c.units.herald||0):0),0);
  const cc=Object.values(s.empires).map(e=>G.citiesOf(s,e.id).length).join('/'); console.log('cities p/a1/a2/a3 '+cc, 'leader '+s.leader, 'h'+h,'pressure',G.aiPressure(s).toFixed(2),'conquer marches',conquerSent,'AI heralds',heralds,'conquests',Object.values(s.empires).map(e=>e.conquests||0).join('/'),'p cities',G.citiesOf(s,'p').length);
}`);
