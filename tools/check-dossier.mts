// Local check (not shipped): rebuild the dossier from an /output dir with the kit library and
// compare it byte for byte with what main.ts wrote. Run: node tools/check-dossier.mts [dir]
import { writeFileSync } from 'node:fs';
import { buildDossier } from '../vendor/makefun-game.ts';

const dir = process.argv[2] ?? 'out';
const bytes = buildDossier(dir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync('scratch-rebuild.json', Buffer.from(bytes));
console.log(`rebuilt ${bytes.length} bytes from ${dir} -> scratch-rebuild.json`);
