// =====================================================================
//  CITYART — per-people building art for the isometric city view.
//  CONTRACT shared by js/cityview.js (which calls it) and js/cityart-<race>.js (which fill it).
//
//  CITYART[race][buildingType] = (api, slot, L, band, ctx) => topZ
//    race:  hearth | delver | sylvan | ash | tide | veil | grave | wind
//    buildingType: townhall, houses, cottage (one house of the houses district), farm, lumber, quarry, mine,
//           warehouse, market, barracks, stable, warpit, workshop, smelter, smithy, armory, academy, tavern,
//           theatre, temple, wall, harbor, magetower, hideout, shrine, and the people's own unique building
//           (bakery, runeforge, heartgrove, pearlbeds, dreamspire, ossuary, aerie, …) — anything BLD draws.
//    slot:  [gx, gy, w, d] in tiles (cottage: [gx, gy, size, size] or as cityview passes it)
//    L:     building level 1..20+; band = 0..3 growth band (1-4, 5-9, 10-14, 15+)
//    ctx:   { era (0..3 from G.techEra), tech (id => bool), city, season (0..3), snow (bool), night (bool),
//             i (index for repeated pieces), building (bool: being upgraded now), layout, active, activity,
//             coastal (bool) + the per-type extras below }
//           Also: 'walltower', 'gate', 'postern' (wall pieces), 'waterhome' (shore homes over the water, every
//           people on a coast; falls back to the people's 'cottage' raised on pilings), 'lighthouse' (coastal town hall 10+); 'harbor' is also called on a coast.
//    return the top z (height in logical px) for label/hit placement, like BLD functions do.
//    Return undefined/false to fall back to cityview's default drawing.
//    Or return an object to opt out of cityview's extras:
//      { top, noDress: true | ['stock','fence','sign','lamps','finial'], noFinial: true, finial: [gx, gy],
//        noTech: true | ['metallurgy','bellows','guilds','granaries','deepshafts','sawpits'],
//        hit: [[gx, gy, w, d, h], …] }      // hit boxes in grid tiles (+ height px); default = slot up to top,
//                                           // but townhall/magetower/mine keep the stock shaped areas unless hit is given
//      api.techMark(name, gx, gy, {n, h, col}) places a mark yourself: 'chimney' (= 'metallurgy'/'bellows'),
//        'guilds', 'granaries', 'deepshafts', 'sawpits'.
//    Extra ctx per type:
//      wall pieces: side 'N'|'S'|'W'|'E', along (runs along gx), wallLevel, wallBand, fortified;
//        'wall' a, b, thick; 'walltower' corner, gx, gy (side null at a corner); 'gate'/'postern' fixed, g0, g1, wide.
//      shore pieces (ctx.coastal = true; false everywhere else, incl. an inland harbor plot):
//        edge 'N'|'E'|'S'|'W', along, a, b (shore extent), u0 (harbor spot), span, piers [u…],
//        depth(u) (water reach from the edge), pt(dd, u) -> [gx, gy], at(dd, u, z) -> [x, y],
//        sea [dx, dy] (land -> water step), front (water drawn in front of land), lake;
//        'harbor' slot = the harbor works' grid rect (mostly water);
//        'waterhome' slot [gx, gy, .9, .85] + wet, u, dd, dep (cityview adds the boardwalk / rope bridges);
//        'lighthouse' slot [gx-.4, gy-.4, .8, .8] + u, dd; rec('beams', {x, y, col}) for the night sweep
//          (col: '#rrggbb' | 'r,g,b' | warm (default) / green / violet / blue / pearl / sea).
//  api (full list at the top of js/cityview.js) adds techMark(name, gx, gy, o), MAGECOL / magicCol, roofCol,
//    lerp2, boneVault, edgePt/lakeDepth/pier/boat/shipHull, stockHarbor/stockLighthouse/stockWallTower, Veilborn
//    flora (moonLily, silkGrass, briarRose, mirrorStone, mothPost, veilFlora, stoneRing); rec('lights', {col:
//    'storm'}) is stormglass blue; rec('sails', {x, y, r, col, frame}) spins with the building's activity.
//  api: the drawing primitives cityview uses — P(gx,gy,z)->[x,y], box, poly, cyl, cone, dome, line, circ,
//    lamp, lampDot, rec(layer, obj) for animated sparks/lights/smoke/birds, shade(hex, amt), STY (people's
//    colour style), R() seeded random, banner, flagpole, plus the higher-level helpers cityview exposes
//    (see the API comment at the top of js/cityview.js once it is published).
//  Drawing happens back-to-front within the slot: draw parts with smaller gx+gy first.
// =====================================================================
'use strict';
const CITYART = {};
for (const r of ['hearth', 'delver', 'sylvan', 'ash', 'tide', 'veil', 'grave', 'wind']) CITYART[r] = {};
