# Wild Spaces

A top-down wildlife conservation anthology game that raises awareness for shrinking habitats. Each episode puts you in the role of an endangered animal and gives it its own distinct gameplay, built around a real-world threat to its home.

Built with [Phaser 3](https://phaser.io/), TypeScript and Vite.

## Episodes

| # | Title | Location | Species | Gameplay |
|---|-------|----------|---------|----------|
| 01 | The Thinning North | Beaufort Sea, Arctic | Polar Bear | Migrate north across cracking, shrinking ice floes and hunt seals to keep stamina up while crossing open water and shipping lanes. |
| 02 | Drowned Echoes | North Atlantic Ocean | North Atlantic Right Whale | Sing to reveal food, nets and your calf's bearing while shipping lanes, ghost fishing gear and seismic sonar drown out your call. |
| 03 | Fractured Canopy | Spiny Forest, Madagascar | Ring-Tailed Lemur | Charge and aim leaps from tree to tree ahead of a slash-and-burn fire wall, avoiding fossas, logging trucks and rival lemurs. |

Levels get harder as you progress, and each episode keeps a local leaderboard of your best completion times.

## Controls

| Action | Polar Bear | Whale | Lemur |
|--------|------------|-------|-------|
| Move | WASD / Arrows | WASD / Arrows | WASD / Arrows |
| Ability | SPACE / SHIFT: Lunge (1.4s cooldown) | SPACE: Sing (cooldown) | Hold SPACE / SHIFT: Charge leap, release to jump (1.1s cooldown after landing) |
| Pause | P / ESC | P / ESC | P / ESC |

Loading the app takes you to the Habitat Map, unless you have a game in progress, in which case it resumes.

## Getting Started

Requires Node.js 22.6 or newer (tests run TypeScript directly with `--experimental-strip-types`).

```bash
npm install
npm run dev       # start the dev server at http://localhost:5173
npm run build     # type-check and build for production into dist/
npm run preview   # serve the production build locally
npm test          # run unit tests
```

## Project Structure

```
src/
  main.ts              Game bootstrap
  config/              Asset manifest
  scenes/              BootScene, HubScene (Habitat Map) and one scene per episode
  systems/             Shared game systems (HUD, pause, shipping/traffic lanes)
  utils/               Shared pure logic (leaderboard, sessions, food scarcity,
                       obstacle avoidance, ability cooldowns)
  __tests__/           Unit tests for shared systems and utils
```

Logic that more than one episode needs lives in `src/systems/` or `src/utils/` instead of being copied between scenes.
