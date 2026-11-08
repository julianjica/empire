// =====================================================================
//  Seasons that matter. Each season (2 game-hours × pace) changes harvests,
//  growth, marching speed and upkeep, shifts which calamities strike, and
//  brings seasonal decisions. Every people feels the year differently.
// =====================================================================
'use strict';

DATA.seasonFx = [
  { name: 'Spring', icon: '🌱', fx: { popGrowth: 1.15, timber: 1.1, grain: 1.0 },
    text: 'Spring: people grow 15% faster, +10% timber. Rivers run high.' },
  { name: 'Summer', icon: '☀️', fx: { grain: 1.1, stone: 1.1, ore: 1.1, travel: 1.05 },
    text: 'Summer: +10% grain, stone and ore; roads are dry (+5% march speed). Campaign season.' },
  { name: 'Autumn', icon: '🍂', fx: { grain: 1.25, tax: 1.05 },
    text: 'Autumn: the harvest — +25% grain, +5% taxes.' },
  { name: 'Winter', icon: '❄️', fx: { grain: 0.7, timber: 0.9, popGrowth: 0.85, travel: 0.8, upkeep: 1.15 },
    text: 'Winter: −30% grain, −10% timber, slower growth, marches 20% slower, troops eat 15% more. Stock up in autumn.' },
];
// how strongly each people feels each season's effects (1 = fully, 0 = not at all), by season index
DATA.seasonRace = Object.assign({}, {
  hearth: [1, 1, 1.2, 1],          // Hearthfolk: the best harvest festivals
  delver: [0.6, 0.6, 0.6, 0.35],   // Deepdelvers: underground halls barely notice the year
  sylvan: [1.2, 1, 1, 0.6],        // Sylvani: forest folk bloom in spring and shrug off winter
  ash:    [1, 1.2, 1, 1],          // Ashborn: summer is for war
}, DATA.seasonRace || {});
// summer campaigns: the Ashborn fight harder when the steppe is dry
const ASH_SUMMER_ATK = 1.08;

G.seasonFx = s => DATA.seasonFx[G.season(s).index];

G.modSources.push((s, owner, city, key) => {
  const se = G.season(s).index;
  const emp = s.empires[owner];
  if (key === 'atk' && emp.race === 'ash' && se === 1) return ASH_SUMMER_ATK;
  const f = DATA.seasonFx[se].fx[key];
  if (!f) return 1;
  const k = (DATA.seasonRace[emp.race] || [1, 1, 1, 1])[se];
  return 1 + (f - 1) * k;
});

// calamities follow the year: floods in spring, swarms and blight in summer, the dead in autumn, quakes and wyrms any time
const BASE_WEIGHTS = DATA.calamityWeights ? { ...DATA.calamityWeights } : null;
const SEASON_WEIGHTS = [
  { flood: 3, feybloom: 1.5, blight: 0.6 },
  { swarm: 2, blight: 1.6, flood: 0.3, starfall: 1.3 },
  { deadrise: 2, tempest: 1.4, blight: 0.8 },
  { flood: 0.2, swarm: 0.1, blight: 0.2, feybloom: 0.3, wyrm: 1.3, deadrise: 1.4 },
];

G.slowHooks.push((s, dtMin) => {
  const se = G.season(s);
  if (BASE_WEIGHTS) for (const [k, w] of Object.entries(BASE_WEIGHTS)) DATA.calamityWeights[k] = w * (SEASON_WEIGHTS[se.index][k] || 1);
  if (s.lastSeason === undefined) { s.lastSeason = se.index; return; }
  if (s.lastSeason === se.index) return;
  s.lastSeason = se.index;
  const info = DATA.seasonFx[se.index];
  G.log(s, 'p', `${info.icon} ${info.text}`, se.index === 3 ? 'warn' : 'info');
  const cap = G.capital(s, 'p');
  if (!cap || s.gameOver) return;
  if (se.index === 2) {
    // harvest feast: spend grain for happiness and growth
    const grain = Math.round(300 + G.citiesOf(s, 'p').length * 150);
    G.addPending(s, { kind: 'season', title: 'The harvest feast', text: `The granaries are full. Spend ${grain} grain from ${cap.name} on a harvest feast across the realm? Every city grows faster and is happier for 20 minutes.`,
      options: [{ key: 'feast', label: `Hold the feast (${grain} grain)` }, { key: 'no', label: 'Keep the grain for winter' }], expires: s.time + 300 * G.pace(s).time, def: 'no', data: { ev: 'feast', grain, city: cap.id } });
  } else if (se.index === 3 && G.econ(s, cap).net.grain < 0 || se.index === 3 && Math.random() < 0.5) {
    const timber = Math.round(250 + G.citiesOf(s, 'p').length * 120);
    G.addPending(s, { kind: 'season', title: 'A bitter winter', text: `A hard frost grips the land. Hand out ${timber} timber from ${cap.name} as firewood, or the cold will thin your people (−8% population in every city).`,
      options: [{ key: 'firewood', label: `Hand out firewood (${timber} timber)` }, { key: 'endure', label: 'Let them endure' }], expires: s.time + 300 * G.pace(s).time, def: 'endure', data: { ev: 'frost', timber, city: cap.id } });
  }
});

G.pendingHandlers.season = (s, p, key) => {
  const d = p.data, city = s.cities[d.city];
  if (d.ev === 'feast') {
    if (key !== 'feast') return null;
    if (!city || city.owner !== 'p' || (city.res.grain || 0) < d.grain) return 'Not enough grain in ' + (city ? city.name : 'the capital');
    city.res.grain -= d.grain;
    for (const c of G.citiesOf(s, 'p')) {
      c.mods = (c.mods || []).filter(m => m.until > s.time);
      c.mods.push({ key: 'popGrowth', mult: 1.4, until: s.time + 1200 * G.pace(s).time, label: 'Festival' });   // counts as a festival for happiness
    }
    G.log(s, 'p', '🍂 The harvest feast is a joyous one!', 'good');
  } else if (d.ev === 'frost') {
    if (key === 'firewood') {
      if (!city || city.owner !== 'p' || (city.res.timber || 0) < d.timber) return 'Not enough timber in ' + (city ? city.name : 'the capital');
      city.res.timber -= d.timber;
      G.log(s, 'p', '🔥 Firewood keeps the hearths burning through the frost.', 'good');
    } else {
      for (const c of G.citiesOf(s, 'p')) c.pop = Math.max(3, c.pop * 0.92);
      G.log(s, 'p', '❄️ The frost took its toll on your people.', 'bad');
    }
  }
  return null;
};

// AI: in autumn, stock up — sell less grain and keep a bigger reserve (handled by its market logic); in winter, campaign less
const prevHostility = G.hostility;
G.hostility = (s, aiId, target) => {
  const h = prevHostility(s, aiId, target);
  if (h <= 0) return h;
  const se = G.season(s).index;
  const race = s.empires[aiId] && s.empires[aiId].race;
  if (se === 3) return h * (race === 'delver' ? 0.9 : 0.6);   // few march through the snow
  if (se === 1 && race === 'ash') return h * 1.25;             // the Horde rides in summer
  return h;
};

// a chip in the city header with this season's effects for your people
// (ui-core.js registers this in CITY_EXTRAS; UI files load after engine modules)
G.seasonChip = city => {
  const se = G.season(S);
  const info = DATA.seasonFx[se.index];
  const k = (DATA.seasonRace[S.empires.p.race] || [1, 1, 1, 1])[se.index];
  const parts = Object.entries(info.fx).map(([key, f]) => {
    const v = (f - 1) * k;
    if (Math.abs(v) < 0.005) return '';
    const name = { popGrowth: 'growth', travel: 'marching', upkeep: 'troop food', tax: 'taxes' }[key] || (DATA.goods[key] ? DATA.goods[key].name.toLowerCase() : key);
    return `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}% ${name}`;
  }).filter(Boolean);
  const left = Math.round((1 - se.progress) * 7200 * G.pace(S).time / S.settings.speed / 60);
  return `<span class="pill season" title="${esc(info.text)}${k !== 1 ? ' Your people feel it ' + (k < 1 ? 'less' : 'more') + ' than most.' : ''}">${info.icon} ${info.name}: ${parts.join(', ')} · ${left} min left</span>`;
};
