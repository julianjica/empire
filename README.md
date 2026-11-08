# Ember & Crown

A single-player browser empire game in the spirit of the classic browser strategy games. You grow a hamlet into an empire of cities, lead a hero into ruins, research new techniques, and bargain or fight with three AI peoples. There is no shop and no premium currency.

## Run

```bash
cd ~/strats && python3 -m http.server 8765
```

Then open http://localhost:8765. Progress autosaves to your browser's localStorage, and time keeps running while the tab is closed (up to 12 hours).

## Game options (chosen at new game)

- **Pace:** Quick (about 2× faster), Standard, or Long (about 0.5×, classic check-in pacing).
- **Mode:** Conquest (topple every rival to win) or Endless (no victory; fallen realms return as new dynasties and warlords keep spawning).
- **Rivals:** Gentle, Fair or Harsh.

## Structure

- `js/data.js`: core tables (goods, terrain, races, buildings, units, paces).
- `js/engine.js`: simulation core (economy, the `G.mod` modifier aggregator, queues, combat, fog of war, neutral sites, AI, save/load). No DOM.
- Feature modules that plug into the engine through hook arrays (`G.modSources`, `G.stepHooks`, `G.battleHooks`, `G.aiHooks`, `G.aiBuildFilters`, …):
  - `js/research.js` (Academy tech tree), `js/forge.js` (unit upgrades), `js/hero.js` (hero, items, adventures)
  - `js/diplomacy.js` (relations, treaties, AI trade, AI-to-AI wars), `js/events.js` (quests, world events, Endless rebirths)
  - `js/calamities.js` (regional calamities and wonders), `js/culture.js` (happiness, tax policy, revolts, culture, traditions)
- `js/ui-core.js`, `js/ui-world.js`, `js/ui-realm.js`, `js/ui-culture.js`, `js/ui-boot.js`: rendering, input and the main loop.
- `js/worldmap.js`: the inked-parchment world map (canvas, pan/zoom, fog, armies, weather). `js/cityview.js`: the isometric town, drawn from the city's race, buildings and surrounding terrain.
- `css/style.css`: theme (follows the system light/dark setting).

Every multiplier in the game (race, terrain, oasis, pace, research, hero, timed events) goes through `G.mod(s, owner, city, key)`, so a new bonus is usually a single table entry.

Debug from the browser console: `EC.S` is the live state and `EC.G.advance(EC.S, seconds)` fast-forwards game time.

## Tests and balance simulations

Run from the repository root (needs Node.js, no dependencies):

```bash
node tests/checks.js              # gameplay paths: scouting, oases, caravans, hero, endless, population, battle preview
node tests/calamities.js          # every calamity, slaying the wyrm, save/load
node tests/culture.js             # happiness factors, tax policy, unrest and revolts, traditions
node tests/endgame.js             # wonders, save slots, export/import, migrations
node tests/naval.js               # seas, islands, harbors, ships, paths
node tests/sim.js standard 6 army # balance: a bot player vs the AI for 6 game-hours (paces: quick, standard, long)
node tests/late.js                # 12-hour run: AI expansion, conquests, snowballing
node tests/early.js hearth        # first hours: idle builders, quest timing, stockpiles
```
