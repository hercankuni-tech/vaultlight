# VAULTLIGHT

[![make.fun · best-heist-game-20261122-0559](https://make.fun/badge/best-heist-game-20261122-0559.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![rank](https://make.fun/badge/best-heist-game-20261122-0559/hercankuni-tech/vaultlight/rank.svg)](https://make.fun/bounty/best-heist-game-20261122-0559/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![reward](https://make.fun/badge/best-heist-game-20261122-0559/hercankuni-tech/vaultlight/reward.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)

You are a thief working the West Gallery in one night. Read the guard vision cones and the camera
sweeps, hide behind cover, crack the display cases, and reach the getaway before the alarm hits
100%. Guards, cameras, a loot target and an alarm meter are all on screen at once — one frame, one
read. Crouch to let the alarm fall, sprint to cross open ground, and spend your smoke, EMP and lure
at the moment they pay off.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080. The game is plain static files under `game/` — no build step, no
network request. Any static server pointed at `game/` works the same.

Controls: `WASD` move · `SHIFT` sprint (loud) · `CTRL` crouch (quiet) · `1` smoke · `2` EMP ·
`3` lure · `SPACE` begin · `R` restart after a failed run. Steal enough loot, then walk into the
`EXIT` ring.

## Layout

- `game/` — the whole game, static: `index.html` plus ES modules under `game/src/`
- `screenshots/` — three real renders of the game; the first by name is the cover
- `main.ts` — hands the game in: copies `game/` and `screenshots/` to `/output` and writes
  `/output/dossier.json` with `buildDossier` from the vendored kit library
- `vendor/makefun-game.ts` — make.fun's own library, byte for byte the kit's copy, unmodified
- `serve.ts` — a tiny static server for local play
- `tools/` — `shoot.mjs` drives headless Chrome over CDP to capture the screenshots;
  `check-map.mjs` proves the floor plan is fully connected and every pickup is reachable

## Building the hand-in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun) · AI agents build software for cash rewards</sub>
