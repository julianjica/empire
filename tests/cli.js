// The keyboard console: the command grammar (G.cli.exec / G.cli.complete) run headless against real game state.
// node tests/cli.js
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/prices.js','js/roads.js','js/quarters.js','js/intercept.js','js/cli.js','js/warplan.js','js/automation.js','js/dynasty.js','js/portraits.js','js/portrait-people.js','js/portrait-gear.js'].filter(f=>fs.existsSync(f));
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
let fails=0;
const ok=(name,cond,extra)=>{ if(!cond) fails++; console.log((cond?'PASS ':'FAIL ')+name+(extra!==undefined?' '+extra:'')); };
const quiet=s=>{ s.settings.hostility=0; s.calamityAt=1e12; s.eventAt=1e12; G.aiPressure=()=>0; for(const k of Object.keys(s.camps)){ G.tileAt(s,s.camps[k].x,s.camps[k].y).camp=null; delete s.camps[k]; } s.campTarget=0; s.routes=[]; };
const fresh=(race='hearth')=>{ const s=G.newGame({name:'T',race}); quiet(s); return s; };
const rich=c=>{ for(const g of Object.keys(DATA.goods)) c.res[g]=50000; };
const near=(s,c,lo=4,hi=7)=>G.freeTile(s,x=>G.dist(x,c)>=lo&&G.dist(x,c)<=hi&&G.landReachable(s,c,x)&&!x.city&&!x.camp&&!x.oasis&&!x.ruin);
const found=(s,c,name)=>{ const t=near(s,c); return G.foundCity(s,'p',t.x,t.y,name); };
const X=(s,line,ctx)=>G.cli.exec(s,'p',line,ctx);
const txt=r=>(r.out||[]).join('\\n')+(r.err?'\\nERR '+r.err:'');

// ---- economy: build, levels, queue ----
{ const s=fresh(); const c=G.capital(s,'p'); rich(c); s.empires.p.gold=1e5; const ctx={};
  const n0=c.buildQueue.length, t0=c.res.timber;
  let r=X(s,'build farm',ctx);
  ok('build farm queues a Farm in the current city', r.ok && c.buildQueue.length===n0+1 && c.buildQueue[n0].type==='farm', txt(r));
  ok('and pays for it', c.res.timber<t0);
  r=X(s,'build lumber camp x3',ctx);
  ok('a multi-word name with xN queues three levels', r.ok && c.buildQueue.filter(q=>q.type==='lumber').length===3, txt(r));
  r=X(s,'BUILD Quar',ctx);
  ok('case-insensitive partial names work', r.ok && c.buildQueue.some(q=>q.type==='quarry'), txt(r));
  r=X(s,'build farn',ctx);
  ok('a typo is refused with a suggestion', !r.ok && /No building called 'farn'.*did you mean Farm\\?/.test(r.err), r.err);
  r=X(s,'build ba',ctx);
  ok('an ambiguous partial lists the candidates', !r.ok && /Barracks/.test(r.err) && /Bakery/.test(r.err), r.err);
  r=X(s,'queue',ctx);
  ok('queue lists the works, numbered', r.ok && /#1 Farm 2/.test(txt(r)) && /#5 Quarry/.test(txt(r)), txt(r));
  const before=c.buildQueue.map(q=>q.type).join();
  r=X(s,'queue move 5 up',ctx);
  ok('queue move reorders works that have not started', r.ok && c.buildQueue[3].type==='quarry' && c.buildQueue[4].type==='lumber', before+' -> '+c.buildQueue.map(q=>q.type).join());
  ok('the moved queue keeps consecutive times', c.buildQueue.every((q,i)=>i===0||Math.abs(q.start-c.buildQueue[i-1].end)<1e-6));
  r=X(s,'queue move 1 down',ctx);
  ok('the work under way cannot be moved', !r.ok && /under way/.test(r.err), r.err);
  const len=c.buildQueue.length; r=X(s,'queue cancel 2',ctx);
  ok('queue cancel removes a work', r.ok && c.buildQueue.length===len-1, txt(r));
  r=X(s,'build farm; build mine',ctx);
  ok('commands chain with ;', r.ok && c.buildQueue.some(q=>q.type==='mine'), txt(r));
  const s2=fresh(); r=X(s2,'res grain',{});
  ok('res <good> shows where it comes from and goes', r.ok && /Produced:/.test(txt(r)) && /Farm/.test(txt(r)) && /Used:/.test(txt(r)) && /net/.test(txt(r)), txt(r));
  r=X(s,'status',ctx);
  ok('status summarises realm and city', r.ok && /gold/.test(txt(r)) && /Grain/.test(txt(r)) && new RegExp(c.name).test(txt(r)));
}

// ---- market, tax, governor, supply ----
{ const s=fresh(); const c=G.capital(s,'p'); for(const g of ['grain','timber','stone','ore']) c.res[g]=900; c.res.iron=0; c.buildings.market=3; s.empires.p.gold=5000; const ctx={};
  const g0=s.empires.p.gold, t0=c.res.timber;
  let r=X(s,'trade sell 200 timber',ctx);
  ok('trade sell turns goods into gold', r.ok && s.empires.p.gold>g0 && c.res.timber===t0-200, txt(r));
  const g1=s.empires.p.gold, i0=c.res.iron;
  r=X(s,'buy 20 iron',ctx);
  ok('buy spends gold for goods', r.ok && s.empires.p.gold<g1 && c.res.iron===i0+20, txt(r));
  r=X(s,'trade sell 10 unobtainium',ctx);
  ok('an unknown good is a friendly error', !r.ok && /No good called/.test(r.err), r.err);
  r=X(s,'governor growth',ctx);
  ok('governor <focus> hands the current city to a governor', r.ok && G.govOf(s,c.id) && G.govOf(s,c.id).focus==='growth', txt(r));
  r=X(s,'governor '+c.name+' military realm off',ctx);
  ok('governor <city> <focus> realm off', r.ok && G.govOf(s,c.id).focus==='military' && G.govOf(s,c.id).realm===false, txt(r));
  r=X(s,'gov '+c.name.slice(0,5)+' off',ctx);
  ok('governor off takes the city back (alias, partial city name)', r.ok && !G.govOf(s,c.id), txt(r));
  r=X(s,'tax high',ctx);
  ok('tax high sets the policy', r.ok && c.taxPolicy==='high', txt(r));
  r=X(s,'supply off',ctx);
  ok('supply off pauses supply lines', r.ok && !G.logistics(s,'p').on, txt(r));
  X(s,'supply on',ctx);
  ok('supply on starts them again', G.logistics(s,'p').on);
}

// ---- military: train, send, move, caravan, columns, recall ----
{ const s=fresh(); const A=G.capital(s,'p'); rich(A); A.buildings.barracks=3; A.buildings.market=2; A.pop=400; s.empires.p.gold=1e5; const ctx={};
  const B=found(s,A,'Brookhaven'); B.buildings.market=1;
  let r=X(s,'train 5 militia',ctx);
  const q=(A.train.barracks||[]).find(x=>x.unit==='militia');
  ok('train 5 militia queues five at the Barracks', r.ok && q && q.left===5, txt(r));
  r=X(s,'train 3 pikemen',ctx);
  ok('plural unit names are understood', r.ok && (A.train.barracks||[]).some(x=>x.unit==='pikeman'&&x.left===3), txt(r));
  r=X(s,'train 2 knights',ctx);
  ok('a unit whose building is missing explains why', !r.ok && /Stable/.test(r.err), r.err);
  r=X(s,'train 5 royalguard in Brookhaven',ctx);
  ok('in <city> trains elsewhere (and reports what is missing there)', !r.ok && /Brookhaven|Barracks/.test(r.err), r.err);
  A.units.militia=20; A.units.pikeman=6;
  r=X(s,'send all from '+A.name+' to Brookhaven reinforce',ctx);
  const m=s.moves.find(x=>x.owner==='p'&&x.type==='reinforce');
  ok('send all from A to B reinforce marches every soldier', r.ok && m && m.units.militia===20 && m.units.pikeman===6 && !A.units.militia, txt(r));
  ok('but leaves the hero at home', A.units.hero===1 && !(m&&m.units.hero));
  A.units.militia=10;
  r=X(s,'move 4 militia to brook',ctx);
  ok('move = reinforce between own cities, partial destination', r.ok && A.units.militia===6 && s.moves.filter(x=>x.type==='reinforce').length===2, txt(r));
  r=X(s,'send 99 militia to Brookhaven',ctx);
  ok('sending more than there are is refused', !r.ok && /Only 6 Militia/.test(r.err), r.err);
  r=X(s,'send 3 militia to Brookhaven',ctx);
  ok('to an own city the mission defaults to reinforce', r.ok && /reinforcements/.test(txt(r)), txt(r));
  r=X(s,'caravan 100 grain, 50 timber to Brookhaven',ctx);
  const cv=s.moves.find(x=>x.type==='trade');
  ok('caravan carries a list of goods', r.ok && cv && cv.cargo.grain===100 && cv.cargo.timber===50, txt(r));
  r=X(s,'columns',ctx);
  ok('columns lists your columns, numbered', r.ok && /#1/.test(txt(r)) && ctx.columns.length>=3, txt(r));
  const own=ctx.columns.findIndex(id=>{ const x=s.moves.find(y=>y.id===id); return x&&x.type==='reinforce'; });
  r=X(s,'recall '+(own+1),ctx);
  ok('recall <#> turns a column home', r.ok && s.moves.some(x=>x.type==='return'), txt(r));
  r=X(s,'recall 99',ctx);
  ok('a column number that does not exist is explained', !r.ok && /No column #99/.test(r.err), r.err);
  r=X(s,'send 2 militia to 999,999',ctx);
  ok('coordinates off the map are refused', !r.ok && /off the map/.test(r.err), r.err);
}

// ---- intercepting a hostile column ----
{ const s=fresh(); const c=G.capital(s,'p'); const ctx={};
  const enemy=Object.values(s.cities).filter(x=>x.owner!=='p'&&G.landReachable(s,c,x)).sort((a,b)=>G.dist(b,c)-G.dist(a,c))[0];
  G.rel(s,enemy.owner).status='war';
  const u0=DATA.races[s.empires[enemy.owner].race].units[0];
  enemy.units[u0]=(enemy.units[u0]||0)+60;
  for(const x of Object.values(s.cities)) x.res.grain=1e5;
  const err=G.sendArmy(s,enemy.id,c.x,c.y,'attack',{[u0]:60});
  const T=s.moves.find(m=>m.owner===enemy.owner&&m.type==='attack');
  ok('setup: a hostile column marches on us', !err && T, err);
  c.units.knight=40;
  let r=X(s,'armies',ctx);
  const i=ctx.columns.indexOf(T.id);
  ok('the hostile column is listed first and marked', r.ok && i===0 && /#1 ⚔/.test(txt(r)), txt(r));
  r=X(s,'intercept 1',ctx);
  const I=s.moves.find(m=>m.owner==='p'&&m.type==='intercept');
  ok('intercept <#> sends the field army to meet it', r.ok && I && I.units.knight===40 && !c.units.knight, txt(r));
  ok('the hero stays home', c.units.hero===1);
  r=X(s,'intercept 1',ctx);
  ok('with nobody left the error is friendly', !r.ok && /No field troops/.test(r.err), r.err);
}

// ---- knowledge: research, study, cast ----
{ const s=fresh(); const c=G.capital(s,'p'); rich(c); c.buildings.academy=3; const ctx={};
  let r=X(s,'research heavy plough',ctx);
  const R=G.research(s,'p'), planned=[...R.studies.map(x=>x.id),...(R.queue||[])];
  ok('research <tech> plans the whole path', r.ok && ['croprotation','sawpits','ploughs'].every(k=>planned.includes(k)), txt(r)+' | '+planned);
  ok('and reports it in order', /Crop Rotation.*Heavy Plough/.test(txt(r)));
  ok('a free academy starts the first topic at once', R.studies.length>=1, R.studies.map(x=>x.id));
  r=X(s,'research heavy plough',ctx);
  ok('planning it twice is refused politely', !r.ok && /Already/.test(r.err), r.err);
  r=X(s,'research cancel heavy plough',ctx);
  ok('research cancel <tech> drops it from the queue', r.ok && !(G.research(s,'p').queue||[]).includes('ploughs'), txt(r));
  r=X(s,'research list',ctx);
  ok('research list shows studies and what is ready', r.ok && /Studying:/.test(txt(r)) && /Ready to study/.test(txt(r)));
  c.buildings.magetower=5; c.res.mana=50000;
  const A=G.grimoire(s,'p');
  r=X(s,'study transmutation',ctx);
  ok('study <arcanum> starts or queues it', r.ok && ((A.active&&A.active.id==='f_transmute')||A.queue.includes('f_transmute')), txt(r));
  const sp=G.spellsOf(s,'p').find(k=>DATA.spells[k].target==='city');
  ok('setup: a city spell is known', !!sp, G.spellsOf(s,'p'));
  if(sp){
    const m0=G.manaOf(s,'p');
    r=X(s,'cast '+DATA.spells[sp].name,ctx);
    ok('cast <spell> casts it on the current city', r.ok && G.manaOf(s,'p')<m0, txt(r));
    r=X(s,'cast '+DATA.spells[sp].name,ctx);
    ok('casting again during its cooldown says when it is ready', !r.ok && /Ready in/.test(r.err), r.err);
  }
  r=X(s,'cast scrying',ctx);
  ok('a tile spell without a target asks for one', !r.ok && /needs a place|Not of your|Needs/.test(r.err), r.err);
}

// ---- relations and confirmations ----
{ const s=fresh(); const ctx={};
  const e=Object.values(s.empires).find(x=>x.id!=='p');
  const word=e.name.split(' ').pop();
  let r=X(s,'declare war '+word,ctx);
  ok('declaring war asks first', r.ok && r.confirm && /\\(y\\/n\\)/.test(txt(r)) && G.rel(s,e.id).status!=='war', txt(r));
  r=X(s,'n',ctx);
  ok('n cancels and nothing happens', /Cancelled/.test(txt(r)) && G.rel(s,e.id).status!=='war' && !ctx.pending);
  X(s,'war '+word,ctx); r=X(s,'y',ctx);
  ok('y carries it out', r.ok && G.rel(s,e.id).status==='war', txt(r));
  X(s,'declare war '+word,ctx); r=X(s,'status',ctx);
  ok('another command instead of an answer drops the question', !ctx.pending && /Cancelled the question/.test(txt(r)));
  r=X(s,'diplo',ctx);
  ok('diplo lists the realms', r.ok && new RegExp(e.name).test(txt(r)) && /war/.test(txt(r)));
  r=X(s,'propose alliance to nobody',ctx);
  ok('an unknown realm is a friendly error', !r.ok && /No realm called 'nobody'/.test(r.err), r.err);
  const c=G.capital(s,'p'); c.buildings.farm=3;
  r=X(s,'demolish farm',ctx);
  ok('demolish asks first', r.confirm && G.lvl(c,'farm')===3);
  r=X(s,'yes',ctx);
  ok('and then lowers the building by one level', r.ok && G.lvl(c,'farm')===2, txt(r));
  r=X(s,'demolish town hall',ctx);
  ok('the Town Hall cannot be torn down', !r.ok && /Town Hall/.test(r.err));
  c.units.militia=12; r=X(s,'dismiss 10 militia',ctx);
  ok('dismiss asks first', r.confirm && c.units.militia===12);
  const p0=c.pop; X(s,'y',ctx);
  ok('dismissed troops become citizens', c.units.militia===2 && c.pop>p0);
}

// ---- navigation, map, game ----
{ const s=fresh(); const A=G.capital(s,'p'); const B=found(s,A,'Brookhaven'); const ctx={};
  let r=X(s,'city brook',ctx);
  ok('city <partial> switches city', r.ok && r.nav && r.nav.city===B.id && ctx.city===B.id);
  r=X(s,'next',ctx);
  ok('next cycles to the next city', r.nav && r.nav.city===A.id);
  r=X(s,'world',ctx);
  ok('a bare tab name opens the tab', r.ok && r.nav && r.nav.tab==='world');
  r=X(s,'tab res',ctx);
  ok('tab <partial> opens a tab', r.ok && r.nav && r.nav.tab==='research', JSON.stringify(r.nav));
  r=X(s,'tile '+A.x+','+A.y,ctx);
  ok('tile x,y describes a place and selects it', r.ok && new RegExp(A.name).test(txt(r)) && r.nav.sel.x===A.x);
  r=X(s,'speed 10',ctx);
  ok('speed sets the game speed', s.settings.speed===10);
  r=X(s,'speed 7',ctx);
  ok('speed snaps to the nearest allowed value', s.settings.speed===5);
  r=X(s,'pause',ctx);
  ok('pause is handed to the UI', r.nav && r.nav.pause==='toggle');
  G.report(s,['p'],'Test battle','win',{extra:'A small skirmish.'});
  r=X(s,'reports',ctx);
  ok('reports lists them numbered', r.ok && /1\\s+Test battle/.test(txt(r)));
  r=X(s,'read 1',ctx);
  ok('read <n> opens a report and marks it read', r.ok && /A small skirmish/.test(txt(r)) && s.reports[0].read);
  r=X(s,'sites cities',ctx);
  ok('sites lists known places nearest first', r.ok && new RegExp(B.name).test(txt(r)) && new RegExp(B.x+','+B.y).test(txt(r)), txt(r));
  r=X(s,'explore on all',ctx);
  ok('explore on all', r.ok && G.autoExploreOn(s,A.id) && G.autoExploreOn(s,B.id));
  r=X(s,'frobnicate',ctx);
  ok('an unknown command is a friendly error', !r.ok && /Unknown command 'frobnicate'/.test(r.err));
  r=X(s,'biuld farm',ctx);
  ok('a misspelt command suggests the right one', !r.ok && /did you mean build/.test(r.err), r.err);
  r=X(s,'help build',ctx);
  ok('help <cmd> explains it', r.ok && /build <building>/.test(txt(r)));
  r=X(s,'help',ctx);
  ok('help lists every command of the grammar', r.ok && G.cli.commands.every(c=>txt(r).includes(c.usage)));
}

// ---- completion ----
{ const s=fresh(); const A=G.capital(s,'p'); A.buildings.barracks=1; A.units.militia=5; const ctx={};
  const C=l=>G.cli.complete(s,'p',l,ctx);
  let c=C('bu');
  ok('commands complete from a prefix', c.items.some(x=>x.text==='build') && c.from===0);
  c=C('build lum');
  ok('building names complete (multi-word, from a partial)', c.items[0] && c.items[0].text==='Lumber Camp' && c.from===6, JSON.stringify(c.items.slice(0,3)));
  c=C('build lbr');
  ok('fuzzy: a subsequence still finds it', c.items.some(x=>x.text==='Lumber Camp'));
  c=C('train 5 mil');
  ok('unit names complete after a count', c.items[0] && c.items[0].text==='Militia');
  c=C('send 5 mi');
  ok('send completes the units in the city', c.items.some(x=>x.text==='Militia'));
  c=C('send all to ');
  ok('after "to" places are offered', c.items.some(x=>x.text===A.name));
  c=C('research crop');
  ok('technologies complete', c.items[0] && c.items[0].text==='Crop Rotation');
  c=C('propose trade to ');
  ok('realms complete after "to"', c.items.length===Object.values(s.empires).filter(e=>e.id!=='p').length);
  c=C('build farm in ');
  ok('cities complete after "in"', c.items.some(x=>x.text===A.name));
  c=C('wor');
  ok('tab names complete too', c.items.some(x=>x.text==='world'));
  // applying a completion yields a line that runs
  const line='build qua'; const cc=C(line); const full=line.slice(0,cc.from)+cc.items[0].text;
  ok('a completed line runs', X(s,full,ctx).ok, full);
}

// ---- engine: G.demolish and G.moveBuild (the console's demolish and queue move go through them) ----
{ const s=fresh(); const c=G.capital(s,'p'); rich(c); s.empires.p.gold=1e5; c.buildQueue=[];
  c.buildings.farm=4; c.res.timber=0; c.res.stone=0; const ep=G._epoch;
  const cost=G.buildCost('farm',4);
  ok('G.demolish lowers a building one level', G.demolish(s,c.id,'farm')===null && G.lvl(c,'farm')===3);
  ok('it salvages a share of that level\\'s goods (no gold)', c.res.timber===Math.floor((cost.timber||0)*G.DEMOLISH_REFUND) && G.DEMOLISH_REFUND>0 && G.DEMOLISH_REFUND<1, c.res.timber+' of '+cost.timber);
  ok('and bumps the epoch', G._epoch>ep);
  ok('the Town Hall is refused', /Town Hall/.test(G.demolish(s,c.id,'townhall')||'') && G.lvl(c,'townhall')>=1);
  rich(c); G.queueBuild(s,c.id,'farm');
  ok('a building with queued works is refused', /queued/.test(G.demolish(s,c.id,'farm')||'') && G.lvl(c,'farm')===3);
  ok('a building the city lacks is refused', !!G.demolish(s,c.id,'magetower'));
  c.buildings.academy=1; G.demolish(s,c.id,'academy');
  ok('the last level removes it', !c.buildings.academy && G.lvl(c,'academy')===0);
  c.buildQueue=[]; for(const t of ['farm','lumber','quarry','lumber']) G.queueBuild(s,c.id,t);
  const order=()=>c.buildQueue.map(q=>q.type).join();
  ok('G.moveBuild reorders works not yet started', G.moveBuild(s,c.id,2,1)===null && order()==='farm,quarry,lumber,lumber', order());
  ok('and recomputes their times like cancelBuild', c.buildQueue.every((q,i)=>i===0||Math.abs(q.start-c.buildQueue[i-1].end)<1e-6) && c.buildQueue.every(q=>Math.abs(q.end-q.start-q.dur)<1e-6));
  ok('the work under way cannot be moved', /under way/.test(G.moveBuild(s,c.id,0,2)||'') && /under way/.test(G.moveBuild(s,c.id,2,0)||''));
  ok('levels of one building stay in order', /order/.test(G.moveBuild(s,c.id,3,2)||'') && order()==='farm,quarry,lumber,lumber');
  ok('levels stay numbered from the built level', c.buildQueue.filter(q=>q.type==='lumber').map(q=>q.level).join()===[G.lvl(c,'lumber')+1,G.lvl(c,'lumber')+2].join());
  ok('a bad index is refused', !!G.moveBuild(s,c.id,9,1));
  const ctx={}; let r=X(s,'queue move 3 up',ctx);
  ok('queue move goes through G.moveBuild', r.ok && order()==='farm,lumber,quarry,lumber', txt(r));
  c.buildQueue=[]; c.buildings.lumber=3; c.res.timber=0;
  r=X(s,'demolish lumber',ctx); ok('demolish asks, and says goods are salvaged', r.confirm && /salvaged/.test(txt(r)), txt(r));
  r=X(s,'y',ctx); ok('then tears down through G.demolish (salvage included)', r.ok && G.lvl(c,'lumber')===2 && c.res.timber>0, txt(r));
}

// ---- 'inbox' is the decisions inbox, not an alias of reports ----
{ const s=fresh(); const rep=G.cli.commands.find(c=>c.name==='reports');
  ok('reports no longer answers to inbox', !(rep.aliases||[]).includes('inbox'));
  const r=X(s,'inbox',{});
  ok('inbox opens the decisions inbox', r.ok && !/No reports yet/.test(txt(r)) && r.nav && r.nav.tab==='automation', txt(r));
}

console.log(fails?fails+' FAILED':'all passed');
`);
