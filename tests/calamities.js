const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
eval(['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js'].filter(f=>fs.existsSync(f)).map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
const ok=(n,c,x)=>console.log((c?'PASS ':'FAIL ')+n+(x?' '+x:''));
for (const kind of Object.keys(DATA.calamities)) {
  const s=G.newGame({name:'T',race:'hearth'}); s.settings.hostility=0;
  const c=G.capital(s,'p');
  const q=G.startCalamity(s,kind,G.tileAt(s,c.x+1,c.y));
  const before=['grain','timber','stone','ore','popGrowth','researchTime'].map(k=>G.mod(s,'p',c,k).toFixed(2)).join('/');
  G.advance(s,600,120);
  const during=['grain','timber','stone','ore','popGrowth','researchTime'].map(k=>G.mod(s,'p',c,k).toFixed(2)).join('/');
  G.advance(s,3*3600,800);
  const left=(s.calamities||[]).filter(x=>x.end>s.time).map(x=>x.kind);
  ok(kind.padEnd(9), !!q, 'mods before '+before+' during '+during+' | after 3h active: '+JSON.stringify(left)+' | reports '+s.reports.filter(r=>/wyrm|dead/i.test(r.title)).length);
}
// slay the wyrm
{ const s=G.newGame({name:'T',race:'hearth'}); s.settings.hostility=0; const c=G.capital(s,'p');
  const q=G.startCalamity(s,'wyrm'); const camp=s.camps[q.data.camp];
  c.units.knight=300; c.res.grain=1e5; c.units.hero=1;
  const e=G.sendArmy(s,c.id,camp.x,camp.y,'attack',{knight:300,hero:1}); G.advance(s,1500,200);
  ok('slay wyrm', e===null && !s.camps[camp.id] && (s.empires.p.renownBonus||0)>=60, 'send '+e+' renownBonus '+s.empires.p.renownBonus+' items '+G.hero(s).items.length+' cal ended '+!!q.ended);
}
// save/load with calamity
{ const s=G.newGame({name:'T',race:'hearth'}); G.startCalamity(s,'deadrise'); G.save(s); const s2=G.load(); G.advance(s2,1200,100); ok('save/load with calamity', s2.calamities.length>=1); }
`);
