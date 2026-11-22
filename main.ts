// VAULTLIGHT — a night heist. Entry point for the make.fun hand-in.
//
// The game itself is the game/ directory: plain static files (game/index.html plus ES modules under
// game/src) that a desktop browser plays with no network request and no build step. This program
// hands it in — it copies game/ and screenshots/ to /output and writes /output/dossier.json with
// buildDossier from the kit's vendored library (vendor/makefun-game.ts, byte for byte the kit's
// copy). Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Node 22, standard library only.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The gate's own caps: only text_max_bytes shapes the bytes; the rest refuse an entry the scorer
// would refuse (a screenshot over 256 KiB or a fifth one; a game/ over 993 entries or 48 MiB, or a
// path under game/ longer than 1000 bytes).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
