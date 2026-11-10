// The wonder's great site in the isometric city view (js/cityview.js + js/cityart*.js), run headless with a
// no-op canvas.  node tests/wonderview.js [worlds]
// For many worlds, every city and race (coastal, river and inland), at stages 0 (queued), 1, 5, 6 and 10:
// the wonder has a hit area, its site is at least 3.5 x 3.5 tiles and dry, every other building keeps its hit,
// the wonder isn't cut off at the top, and a city without the wonder reserves no site and draws as before.
const fs=require('fs');
// reproducible worlds: Math.random is seeded per world (--seed=N moves the whole run)
let SEED=+((process.argv.find(a=>a.startsWith('--seed='))||'').split('=')[1]||1);
const reseed=n=>{ let a=(n*2654435761)>>>0; Math.random=()=>{ a=(a+0x6D2B79F5)|0; let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; };
reseed(SEED);
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
// --- a do-nothing DOM and 2D canvas: every property read is a no-op function / chainable stub
const stub=()=>{ const f=function(){ return P; }; const P=new Proxy(f,{ get:(t,k)=>k===Symbol.toPrimitive?()=>0:k==='width'||k==='height'?(t[k]||800):k in t?t[k]:P, set:(t,k,v)=>{ t[k]=v; return true; }, apply:()=>P }); return P; };
const mkCanvas=()=>{ const o={ width:800, height:500, style:{}, className:'', getContext:()=>stub(), toDataURL:()=>'', addEventListener(){}, getBoundingClientRect:()=>({left:0,top:0,width:800,height:500}), isConnected:false, parentNode:null }; return o; };
global.window=global; global.devicePixelRatio=1; global.addEventListener=()=>{};
const HOST={ clientWidth:1000, style:{}, appendChild(){} };
global.document={ createElement:()=>mkCanvas(), addEventListener(){}, getElementById:id=>id==='cityHost'?HOST:null, hidden:false };
global.matchMedia=()=>({ matches:false, addEventListener(){} }); window.matchMedia=global.matchMedia;
global.requestAnimationFrame=()=>0; global.cancelAnimationFrame=()=>{};
if(typeof performance==='undefined') global.performance={ now:()=>Date.now() };
const files=['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/prices.js','js/patrols.js','js/roads.js','js/quarters.js','js/intercept.js','js/warplan.js','js/automation.js','js/dynasty.js',
  'js/cityart.js','js/cityview.js','js/cityart-hearth.js','js/cityart-delver.js','js/cityart-sylvan.js','js/cityart-ash.js','js/cityart-tide.js','js/cityart-veil.js','js/cityart-grave.js','js/cityart-wind.js'].filter(f=>fs.existsSync(f));
eval('var S=null; const MOUNT_HOOKS=[]; const UI={}; const esc=s=>String(s); const render=()=>{};\n'+files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
if(typeof initRaces2==='function') initRaces2();
let fails=0;
const ok=(name,cond,extra)=>{ if(!cond) fails++; if(!cond||process.env.VERBOSE) console.log((cond?'PASS ':'FAIL ')+name+(extra?' '+extra:'')); };
const CV=window.EC_CITYVIEW;
const warns=[]; const ow=console.warn; console.warn=(...a)=>{ warns.push(a.map(String).join(' ').slice(0,160)); };
const draw=c=>{ cityViewHtml(c); MOUNT_HOOKS.forEach(h=>h('city')); CV.draw(0); };
const setup=(c,lvl,stage,queued)=>{
  for(const t of Object.keys(DATA.buildings)){ const b=DATA.buildings[t]; if(b.wonder){ delete c.buildings[t]; continue; } if(b.race && b.race!==S.empires[c.owner].race) continue; c.buildings[t]=Math.min(b.max||20,lvl); }
  c.buildQueue=[]; const wk=DATA.wonders[S.empires[c.owner].race].key;
  if(stage) c.buildings[wk]=stage;
  if(queued) c.buildQueue.push({type:wk,level:(stage||0)+1,start:S.time-10,end:S.time+1000});
  return wk;
};
const worlds=+(process.argv.find(a=>/^[0-9]+$/.test(a))||6);
const races=DATA.raceOrder;
let checked=0, coastal=0, river=0, full=0, astride=0, moved=0;
const t0=Date.now();
for(let wi=0; wi<worlds; wi++){
  reseed(SEED*1000+wi);
  S=G.newGame({name:'W'+wi,race:races[wi%races.length],rivals:7,difficulty:'normal'});
  G.advance(S,1800,20);
  for(const c of Object.values(S.cities)){
    const race=S.empires[c.owner].race, tag=c.id+'/'+race+'/w'+wi+'/seed'+SEED;
    // without the wonder: no site, and the wonder takes no great plot
    let wk=setup(c,15,0,false); draw(c);
    ok(tag+' no site without the wonder', CV.wonderSite()===null);
    const baseTypes=new Set((CV.hits||[]).map(h=>h.type));
    const reg=CV.region(); if(reg.lakes.length) coastal++; if(reg.river) river++;
    let first=null;
    for(const [st,q] of [[0,true],[1,false],[5,true],[6,false],[10,false]]){
      setup(c,15,st,q); draw(c); checked++;
      const tg=tag+' stage '+st+(q?'q':''), hits=CV.hits||[], types=new Set(hits.map(h=>h.type)), ws=CV.wonderSite();
      ok(tg+' wonder hit', types.has(wk));
      ok(tg+' site', !!ws, ws?'':JSON.stringify({lakes:CV.region().lakes, river:CV.region().river, why:CV.wonderDebug()}).slice(0,1500)); if(!ws) continue;
      const [x,y,w,d]=ws.r;
      ok(tg+' site >= 3.5 tiles', Math.min(w,d)>=3.5-1e-6, ws.r.join(','));
      let wet=false; for(let i=0;i<=8;i++) for(let j=0;j<=8;j++) if(CV.wet(x+w*i/8,y+d*j/8,0)) wet=true;
      ok(tg+' site dry', !wet, ws.r.join(','));
      ok(tg+' site on the plot', x>=0 && y>=0 && x+w<=24 && y+d<=24);
      if(!first) first=ws.r.join(','); else ok(tg+' site stable across stages', first===ws.r.join(','));
      for(const t of baseTypes) if(t!==wk) ok(tg+' keeps hit '+t, types.has(t));
      for(const t of Object.keys(c.buildings)) if(c.buildings[t]>0 && DATA.buildings[t] && !G.buildStatus(S,c,t).hidden && t!=='wall') ok(tg+' built '+t+' has hit', types.has(t), types.has(t)?'':'(no wonder: '+baseTypes.has(t)+')');
      let top=1e9; for(const h of hits) if(h.type===wk) for(const p of h.pts) top=Math.min(top,p[1]);
      const [K,ox,oy]=CV.xf; ok(tg+' wonder not cut off', top*K+oy>=-2, (top*K+oy).toFixed(1));
      if(st===10){ if(Math.min(w,d)>=4.5-1e-6) full++; if(ws.wallSide) astride++; if(ws.moved) moved++; }
    }
    setup(c,12,0,false);
  }
}
// the stock fallback rises with the stage and beats the town hall from stage 6
{
  const c=Object.values(S.cities).find(cc=>S.empires[cc.owner].race==='hearth')||Object.values(S.cities)[0];
  const wk=DATA.wonders[S.empires[c.owner].race].key, heights=[];
  for(const st of [1,3,5,6,8,10]){ setup(c,15,st,false); draw(c); let top=1e9,base=-1e9; for(const h of CV.hits) if(h.type===wk) for(const p of h.pts){ top=Math.min(top,p[1]); base=Math.max(base,p[1]); } heights.push(Math.round(base-top)); }
  ok('wonder grows with its stage '+heights.join(' < '), heights.every((v,i)=>!i||v>=heights[i-1]) && heights[5]>heights[0]+60);
  setup(c,12,0,false);
}
console.warn=ow;
ok('no CITYART warnings', !warns.some(w=>/CITYART/.test(w)), warns.filter(w=>/CITYART/.test(w)).slice(0,5).join(' | '));
console.log('checked '+checked+' city renders over '+worlds+' worlds ('+coastal+' coastal, '+river+' river cities); full 4.5 sites at stage 10: '+full+', astride the wall: '+astride+', yield building moved off the site: '+moved+' · '+((Date.now()-t0)/1000).toFixed(1)+' s');
console.log(fails?fails+' FAILED':'ALL PASS');
process.exit(fails?1:0);
`);
