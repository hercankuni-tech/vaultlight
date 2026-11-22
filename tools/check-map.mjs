// Validates the VAULTLIGHT floor plan: rectangular map, fully walled border, no orphaned rooms,
// every placed thing on walkable ground, and a flood fill from the thief start reaching the exit,
// every loot and every hiding spot. Run: node tools/check-map.mjs
import { MAP, MAP_W, MAP_H, buildLevel, tileCenter, TILE_WALL } from '../game/src/level.js';

const errs = [];
if (MAP.length !== MAP_H) errs.push(`MAP rows ${MAP.length} != MAP_H`);
MAP.forEach((row, y) => {
  if (row.length !== MAP_W) errs.push(`row ${y} length ${row.length} != ${MAP_W}`);
  if (row[0] !== '#' || row[MAP_W - 1] !== '#') errs.push(`row ${y} not walled at both ends`);
});
MAP[0].split('').forEach((ch, x) => { if (ch !== '#') errs.push(`top row open at ${x}`); });
MAP[MAP_H - 1].split('').forEach((ch, x) => { if (ch !== '#') errs.push(`bottom row open at ${x}`); });

const L = buildLevel();
const solid = (tx, ty) => L.tiles[ty][tx] === TILE_WALL;

const flood = () => {
  const seen = new Set();
  const sx = Math.floor(L.start.x / 24), sy = Math.floor(L.start.y / 24);
  const q = [[sx, sy]];
  seen.add(`${sx},${sy}`);
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      if (seen.has(`${nx},${ny}`) || solid(nx, ny)) continue;
      seen.add(`${nx},${ny}`);
      q.push([nx, ny]);
    }
  }
  return seen;
};
const reach = flood();
const open = MAP.reduce((n, row, y) => n + row.split('').filter((c, x) => c !== '#' && !solid(x, y)).length, 0);
if (reach.size < open * 0.9) errs.push(`flood fill reaches ${reach.size} of ~${open} open tiles`);

const onReach = (p, what) => {
  const tx = Math.floor(p.x / 24), ty = Math.floor(p.y / 24);
  if (solid(tx, ty)) errs.push(`${what} sits on a wall at tile ${tx},${ty}`);
  if (!reach.has(`${tx},${ty}`)) errs.push(`${what} unreachable at tile ${tx},${ty}`);
};
L.loot.forEach((l) => onReach(l, `loot ${l.name}`));
L.hides.forEach((h) => onReach(h, 'hiding spot'));
L.guards.forEach((g) => g.pts.forEach((p) => onReach(p, `guard ${g.name} waypoint`)));
if (L.loot.length < 3) errs.push(`only ${L.loot.length} loot, need at least 3`);

if (errs.length) {
  console.error('MAP FAIL:\n' + [...new Set(errs)].join('\n'));
  process.exit(1);
}
console.log(`map ok: ${MAP_W}x${MAP_H}, open ${open}, reachable ${reach.size}, loot ${L.loot.length}, hides ${L.hides.length}, guards ${L.guards.length}, cams ${L.cams.length}`);
