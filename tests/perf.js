// Performance: headless timings of G.advance in a crowded 7-rival world (normal size: 80x80).  node tests/perf.js [hours] [--long] [--world=small|normal|large]
// (--long also times a 12-hour offline catch-up, which takes about a minute on its own)
// Prints ms per game-minute for successive hours, plus the cost of a few per-render engine calls.
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/roads.js','js/intercept.js','js/dynasty.js'].filter(f=>fs.existsSync(f));
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
const hours=+(process.argv.find(a=>/^[0-9]+$/.test(a))||4);
const now=()=>Number(process.hrtime.bigint())/1e6;
const world=((process.argv.find(a=>a.startsWith('--world='))||'').split('=')[1])||'normal';
const s=G.newGame({name:'Perf',race:'hearth',rivals:7,difficulty:'normal',worldSize:world});
console.log('map '+s.map+'x'+s.map+', empires '+Object.keys(s.empires).length);
for(let h=1;h<=hours;h++){
  const t0=now();
  // the browser loop advances ~1 s of real time per call at the chosen speed; emulate 25x: 25 game-sec chunks
  for(let i=0;i<144;i++) G.advance(s,25,50);
  const ms=now()-t0;
  console.log('hour '+h+': '+(ms/60).toFixed(2)+' ms per game-minute · cities '+Object.keys(s.cities).length+' · moves '+s.moves.length+' · routes '+((s.routes||[]).length));
}
// per-render engine costs (what ui-core's renderTop/renderSide call every second)
const time=(name,f,n=200)=>{ const t0=now(); for(let i=0;i<n;i++) f(); console.log(name+': '+((now()-t0)/n).toFixed(3)+' ms'); };
const mine=G.citiesOf(s,'p');
time('G.econ x player cities',()=>mine.forEach(c=>G.econ(s,c)));
time('G.econ x all cities',()=>Object.values(s.cities).forEach(c=>G.econ(s,c)));
time('G.visibleSet',()=>G.visibleSet(s));
time('G.serialize (autosave)',()=>G.serialize(s),20);
// offline catch-up (G.catchUp runs <= 6000 steps); ui-boot runs gaps over 15 min in slices behind a progress veil
const ck=JSON.parse(G.serialize(s));
for (const h of process.argv.includes('--long') ? [1, 12] : [1]) { const t=G.deserialize(JSON.stringify(ck)); t.realLast=Date.now()-h*3600e3; const t0=now(); G.catchUp(t); console.log('catch-up of '+h+' h offline: '+(now()-t0).toFixed(0)+' ms'); }
// step granularity of the live loop: 25 game-seconds per tick at 25x speed
for (const [label,n] of [['old loop, 2 s steps',50],['new loop, 5 s steps',5]]) { const t=G.deserialize(JSON.stringify(ck)); const t0=now(); for(let i=0;i<60;i++) G.advance(t,25,n); console.log(label+': '+((now()-t0)/60).toFixed(2)+' ms per 1-second tick at 25x'); }
`);
