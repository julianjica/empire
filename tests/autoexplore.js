// Auto-explore: scouts map the nearest unknown land on their own.  node tests/autoexplore.js
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=fs.readFileSync('index.html','utf8').match(/js\/[a-z0-9-]+\.js/g).filter(f=>!/ui-|worldmap|cityview|cityart|audio|tutorial|portrait/.test(f));
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
let fails=0; const ok=(n,c,x)=>{ if(!c) fails++; console.log((c?'PASS ':'FAIL ')+n+(x?' '+x:'')); };
const s=G.newGame({name:'T',race:'hearth',rivals:3}); s.settings.hostility=0; s.calamityAt=1e12; s.eventAt=1e12;
const c=G.capital(s,'p'); c.units.scout=4;
const known0=s.explored.reduce((a,b)=>a+b,0), reps0=s.reports.length;
ok('switch on sends scouts', G.setAutoExplore(s,c.id,true)===null && s.moves.filter(m=>m.auto).length===2);
ok('never more than two out at once', s.moves.filter(m=>m.auto).length<=2 && c.units.scout===2);
G.advance(s,3600,400);
const known1=s.explored.reduce((a,b)=>a+b,0);
ok('an hour of auto-exploring maps new land', known1>known0+30, known0+' -> '+known1);
ok('open-land trips do not flood the reports', s.reports.length-reps0 < 15, 'reports +'+(s.reports.length-reps0));
const ser=G.serialize(s); const s2=G.deserialize(ser);
ok('setting survives save/load', G.autoExploreOn(s2,c.id));
G.setAutoExplore(s,c.id,false); const out=s.moves.filter(m=>m.auto).length; G.advance(s,1200,100);
ok('switch off stops new trips', s.moves.filter(m=>m.auto).length<=out);
ok('target never water', (()=>{ const t=G.autoExploreTarget(s,c,false); return !t || !G.isWater(t); })());
console.log(fails?fails+' FAILED':'all auto-explore checks passed');
`);
