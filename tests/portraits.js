// Procedural portraits (js/portraits.js + js/portrait-people.js + js/portrait-gear.js).  node tests/portraits.js
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js',
  'js/portraits.js','js/portrait-people.js','js/portrait-gear.js'].filter(f=>fs.existsSync(f));
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
if(typeof initRaces2==='function') initRaces2();
let fails=0;
const ok=(name,cond,extra)=>{ if(!cond) fails++; console.log((cond?'PASS ':'FAIL ')+name+(extra?' '+extra:'')); };
const KINDS=['unit','hero','advisor','governor','spy','ruler','citizen'];
const OFFICES=['steward','marshal','spymaster','priest','archmage'];
const RACES=DATA.raceOrder;
// balanced tags: every <x …> that is not self-closing must be matched by </x>, in order
const balanced=svg=>{ const st=[]; const re=/<(\\/?)([a-zA-Z][\\w:-]*)[^>]*?(\\/?)>/g; let m;
  while((m=re.exec(svg))){ if(m[3]) continue; if(m[1]){ if(st.pop()!==m[2]) return false; } else st.push(m[2]); } return st.length===0; };
const wellFormed=svg=>typeof svg==='string' && svg.startsWith('<svg') && svg.endsWith('</svg>') && balanced(svg) && !/undefined|NaN|null|\\[object/.test(svg);
const specs=[];
for(const r of RACES){ const R=DATA.races[r];
  for(const k of KINDS) for(const seed of [1,2,'x',42]){
    const s={race:r,kind:k,seed,color:R.color,rank:seed===42?10:3,era:typeof seed==='number'?seed%4:0};
    if(k==='unit') s.unit=R.units[(typeof seed==='number'?seed:3)%R.units.length];
    if(k==='advisor') s.role=OFFICES[(typeof seed==='number'?seed:0)%OFFICES.length];
    if(k==='hero'&&seed===2){ s.wounded=0.7; s.female=true; }
    if(k==='hero'&&seed==='x') s.dead=true;
    specs.push(s);
  }
  for(const u of R.units) specs.push({race:r,kind:'unit',unit:u,color:R.color});
  if(R.mageUnit) specs.push({race:r,kind:'unit',unit:R.mageUnit,color:R.color});
}
specs.push({race:'hearth',kind:'monster',role:'wyrm',seed:'w'},{kind:'unit'},{});

// ---- people: anatomy + palette ----
ok('anatomy for all eight peoples', RACES.every(r=>{ const a=PORTRAIT.anatomy[r]; return a && a.head && a.crown<a.brow && a.brow<a.chin && a.chin<a.neck.y+2 && a.shoulders.left<a.shoulders.right && (a.ears===null||a.ears.length===2); }));
ok('anatomy in the 0..100 box', RACES.every(r=>JSON.stringify(PORTRAIT.anatomy[r]).match(/-?[\\d.]+/g).map(Number).every(v=>v>=0&&v<=100)));
ok('palette for all eight peoples', RACES.every(r=>{ const p=PORTRAIT.palette[r]; return p && p.skin.length && p.hair.length && p.cloth.length && p.bg.length===2 && p.metal && p.accent && p.eye && p.motif; }));

// ---- every race x kind x seed is a well-formed svg ----
let bad=[]; for(const s of specs){ const svg=G.portrait(s,96); if(!wellFormed(svg)) bad.push(JSON.stringify(s)); }
ok('every portrait well-formed ('+specs.length+' specs)', bad.length===0, bad.slice(0,3).join(' | '));
bad=[]; for(const s of specs.slice(0,60)) for(const z of [32,40,128]) if(!wellFormed(G.portrait(s,z))) bad.push(z+':'+JSON.stringify(s));
ok('well-formed at 32/40/128px', bad.length===0, bad.slice(0,3).join(' | '));
ok('people layers drawn (head present) for a hero', (G.portrait({race:'delver',kind:'hero',seed:1},96).match(/<path/g)||[]).length>15);
{ const people=PORTRAIT.peopleLayers||[]; const mk=spec=>({spec,race:'ash',kind:spec.kind,role:spec.role,skipPeople:true,look:{},anat:PORTRAIT.anatomy.ash,pal:PORTRAIT.palette.ash,id:'t',size:96});
  ok('people layers skip monsters / ships / siege', people.length>=4 && people.every(fn=>fn(mk({kind:'monster',role:'beast'}))===''));
  const siege=DATA.races.ash.units.find(u=>G.roleOf(u)==='siege'); ok('siege unit flagged skipPeople', !G.portrait({race:'ash',kind:'unit',unit:siege,seed:1},96).includes('-s)"')); }

// ---- determinism + ids ----
{ const s={race:'veil',kind:'hero',seed:'Ysolt',color:'#c35bb0',rank:7,era:2};
  const a=G.portrait(s,96); PORTRAIT.clearCache(); const b=G.portrait({...s},96);
  ok('deterministic: same spec, same svg (cache cleared)', a===b);
  const ids=svg=>[...svg.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
  const c=G.portrait({...s,seed:'Mira'},96);
  const ia=ids(a), ic=ids(c);
  ok('ids unique within an svg', new Set(ia).size===ia.length && ia.length>0);
  ok('ids differ between two different portraits', ia.every(i=>!ic.includes(i)));
  ok('every url(#id) reference resolves inside its svg', [a,c,G.portrait({race:'grave',kind:'spy',seed:3,dead:true},64)].every(svg=>[...svg.matchAll(/url\\(#([^)]+)\\)|href="#([^"]+)"/g)].every(m=>svg.includes('id="'+(m[1]||m[2])+'"'))));
  ok('seed varies the face', new Set(['a','b','c','d','e','f'].map(sd=>G.portrait({race:'hearth',kind:'citizen',seed:sd},64))).size===6);
  ok('era changes clothing', G.portrait({race:'hearth',kind:'hero',seed:1,era:0},64)!==G.portrait({race:'hearth',kind:'hero',seed:1,era:3},64));
  ok('female flag respected and deterministic', G.portrait({race:'sylvan',kind:'hero',seed:1,female:true},64)!==G.portrait({race:'sylvan',kind:'hero',seed:1,female:false},64));
}
// ---- variety: 16 seeds of the same people + kind (same sex) must give >= 12 distinct faces (head+face+hair layer output with ids, colours and numbers stripped: the distinct-element structure must differ, not just jitter)
{ const capt=[]; const wrap=['head','face','hair'].map(l=>{ const a=PORTRAIT.layers[l], i=a.length-1, fn=a[i]; a[i]=ctx=>{ const o=fn(ctx)||''; capt.push(o); return o; }; return [a,i,fn]; });
  const noId=v=>v.replace(/pt[0-9a-z]+/g,'#').replace(/#[0-9a-f]{6}/g,'#').replace(/-?[0-9.]+/g,'0'); let worst=17, where='', bad=[];
  for(const r of RACES) for(const k of ['hero','citizen','advisor','ruler','governor','spy','unit']) for(const female of [false,true]){
    const faces=new Set();
    for(let i=0;i<16;i++){ capt.length=0; PORTRAIT.clearCache(); G.portrait({race:r,kind:k,seed:'v'+i,female,role:k==='advisor'?OFFICES[i%5]:undefined,unit:k==='unit'?DATA.races[r].units[0]:undefined,color:DATA.races[r].color},96); faces.add(noId(capt.join(''))); }
    if(faces.size<worst){ worst=faces.size; where=r+' '+k+(female?' f':' m'); } if(faces.size<12) bad.push(r+' '+k+(female?' f':' m')+' '+faces.size);
  }
  for(const [a,i,fn] of wrap) a[i]=fn; PORTRAIT.clearCache();
  ok('variety: 16 seeds per people/kind/sex give >= 12 distinct faces (worst '+worst+' '+where+')', bad.length===0, bad.slice(0,6).join(' | '));
}
// ---- gear hooks: hideHair / hideEars from a frameBack layer ----
{ const fn=ctx=>{ if(ctx.spec.seed==='helm'){ ctx.hideHair=true; ctx.hideEars=true; } return ''; };
  PORTRAIT.layers.frameBack.unshift(fn); PORTRAIT.clearCache();
  const a=G.portrait({race:'sylvan',kind:'hero',seed:'helm'},96), b=G.portrait({race:'sylvan',kind:'hero',seed:'helm2'},96);
  PORTRAIT.layers.frameBack.shift(); PORTRAIT.clearCache();
  ok('hideHair/hideEars shrink the drawing', a.length<b.length-400 && wellFormed(a), a.length+' vs '+b.length);
}
// ---- size + timing ----
{ PORTRAIT.clearCache(); const sizes=specs.map(s=>G.portrait(s,96).length); const avg=sizes.reduce((a,b)=>a+b,0)/sizes.length, max=Math.max(...sizes);
  ok('svg size: typical under ~8 KB people+gear (avg '+Math.round(avg)+', max '+max+')', avg<8500 && max<16000);
  PORTRAIT.clearCache(); const t0=Date.now(); for(const s of specs) G.portrait(s,96); const per=(Date.now()-t0)/specs.length;
  ok('generation under 2 ms each ('+per.toFixed(3)+' ms)', per<2);
  const t1=Date.now(); for(let i=0;i<2000;i++) G.portrait(specs[i%specs.length],96); ok('cached lookups fast', Date.now()-t1<200);
}
// ---- gear checks: add below this line (inside the eval template; ok(), specs, wellFormed in scope) ----
{ // portrait-gear.js: frames, headgear, weapons, mounts, era, whole pictures
  const GR=PORTRAIT.gear, own=new Set(RACES.flatMap(r=>DATA.races[r].units.concat(DATA.races[r].mageUnit||[])));
  const shared=Object.keys(DATA.units).filter(u=>DATA.units[u].at&&!own.has(u));
  const planOf=(race,spec)=>{ const ctx={spec,race,kind:spec.kind||'unit',role:spec.role||(spec.unit?G.roleOf(spec.unit):'infantry'),era:spec.era|0,pal:PORTRAIT.palette[race],anat:PORTRAIT.anatomy[race],id:'t'}; GR.plan(ctx); return ctx; };
  const all=[]; for(const r of RACES) for(const u of new Set(DATA.races[r].units.concat(DATA.races[r].mageUnit||[]))) all.push([r,u]);
  for(const u of shared) all.push(['hearth',u]);
  let bad=[];
  for(const [r,u] of all){ const c=planOf(r,{race:r,kind:'unit',unit:u}), g=c.gear;
    const drawn=g.whole || (g.weapon&&GR.WDRAW[g.weapon]) ; if(!drawn) bad.push(r+':'+u); }
  ok('gear: every unit of every people and every shared unit gets a weapon or a whole picture ('+all.length+')', bad.length===0, bad.join(' '));
  bad=all.filter(([r,u])=>!['siege','ship'].includes(G.roleOf(u))&&!GR.HEADGEAR[u]).map(x=>x.join(':'));
  ok('gear: headgear table covers every troop', bad.length===0, bad.join(' '));
  bad=[]; for(const [r,u] of all) for(const era of [0,1,2,3]) for(const rank of [0,5,10]){ const v=G.portrait({race:r,kind:'unit',unit:u,color:DATA.races[r].color,era,rank},64); if(!wellFormed(v)) bad.push(r+':'+u+':'+era); }
  ok('gear: every unit well-formed at every era and rank (no undefined/NaN)', bad.length===0, bad.slice(0,5).join(' '));
  const mounted=all.filter(([r,u])=>['cavalry','flyer'].includes(G.roleOf(u)));
  bad=mounted.filter(([r,u])=>!GR.MOUNTS[u]||!(GR.BEAST[GR.MOUNTS[u]])||!planOf(r,{race:r,kind:'unit',unit:u}).gear.mount).map(x=>x.join(':'));
  ok('gear: every cavalry/flyer unit has an explicit mount entry ('+mounted.length+')', mounted.length>=16&&bad.length===0, bad.join(' '));
  bad=mounted.filter(([r,u])=>G.roleOf(u)==='flyer'&&!planOf(r,{race:r,kind:'unit',unit:u}).gear.wings).map(x=>x.join(':'));
  ok('gear: flyers have wings behind', bad.length===0, bad.join(' '));
  bad=[]; for(const [r,u] of all){ const a=G.portrait({race:r,kind:'unit',unit:u,era:0},64), set=new Set([0,1,2,3].map(e=>G.portrait({race:r,kind:'unit',unit:u,era:e},64))); if(set.size<4) bad.push(r+':'+u+' ('+set.size+')'); }
  ok('gear: era 0..3 gives four different pictures for every unit', bad.length===0, bad.slice(0,6).join(' '));
  { const noId=v=>v.replace(/pt[0-9a-z]+/g,'#'); ok('gear: missing era = era 0 (same drawing)', noId(G.portrait({race:'delver',kind:'unit',unit:'axeguard'},64))===noId(G.portrait({race:'delver',kind:'unit',unit:'axeguard',era:0},64))); }
  ok('gear: era changes hero gear', G.portrait({race:'ash',kind:'hero',seed:5,rank:5,era:1},64)!==G.portrait({race:'ash',kind:'hero',seed:5,rank:5,era:2},64));
  const frames=[...Array(11).keys()].map(rk=>G.portrait({race:'tide',kind:'unit',unit:'shellguard',rank:rk,era:1},64));
  ok('gear: frames for rank 0..10 well-formed, four trims (leather/bronze/silver/gold)', frames.every(wellFormed) && new Set(frames).size>=4 && frames[10].includes('#fff3c0') && frames[7].includes('#ffffff') && frames[4].includes('#f0c890') && frames[1].includes('#d8b98a'));
  ok('gear: gold frame has gems; hero and ruler frames are grander', frames[9].includes('#2f7fd0') && G.portrait({race:'wind',kind:'ruler',seed:1},64).includes('M38 8L36 1.5') && G.portrait({race:'wind',kind:'hero',seed:1},64).includes('M50 1L52.2'));
  ok('gear: dead hero gets the black ribbon; wounded hero a bandage', G.portrait({race:'hearth',kind:'hero',seed:1,dead:true},64).includes('M60 1.5L72 1.5') && G.portrait({race:'hearth',kind:'hero',seed:1,wounded:0.8},64).includes('#efe6d2'));
  const mons=GR.MONSTERS.map(m=>G.portrait({kind:'monster',role:m,seed:m},64));
  ok('gear: six monster pictures, all different and well-formed', mons.length===6 && mons.every(wellFormed) && new Set(mons).size===6);
  ok('gear: monster pictures skip the people layers', GR.MONSTERS.every(m=>{ const c=planOf('hearth',{kind:'monster',role:m}); return c.whole && c.skipPeople; }));
  const sieges=all.filter(([r,u])=>G.roleOf(u)==='siege'), ships=['transport','warship'];
  ok('gear: '+sieges.length+' culture-themed siege pictures, all different', sieges.length===16 && new Set(sieges.map(([r,u])=>G.portrait({race:r,kind:'unit',unit:u},64))).size===16 && sieges.every(([r,u])=>planOf(r,{race:r,kind:'unit',unit:u}).gear.whole==='siege'));
  ok('gear: ships per people (prow + emblem sail), all different', new Set(RACES.flatMap(r=>ships.map(u=>G.portrait({race:r,kind:'unit',unit:u,color:DATA.races[r].color},64)))).size===16);
  ok('gear: kinds have the right headgear', planOf('hearth',{kind:'ruler'}).gear.helm[0]==='crown' && planOf('veil',{kind:'advisor',role:'priest'}).gear.helm[0]==='mitre' && planOf('grave',{kind:'spy'}).gear.helm.length===0);
  ok('gear: full helms hide hair and ears', (()=>{ const c=planOf('hearth',{kind:'unit',unit:'knight'}); return c.hideHair && c.hideEars; })() && !planOf('sylvan',{kind:'unit',unit:'warden'}).hideHair);
  { PORTRAIT.clearCache(); const t0=Date.now(); let n=0; for(const [r,u] of all) for(const era of [0,3]){ G.portrait({race:r,kind:'unit',unit:u,era,rank:7},96); n++; } ok('gear: every unit renders under 2 ms ('+((Date.now()-t0)/n).toFixed(3)+' ms)', (Date.now()-t0)/n<2); }
}

console.log(fails?fails+' FAILED':'ALL PASS'); if(fails) process.exitCode=1;
`);
