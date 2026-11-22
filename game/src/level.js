// The vault floor of VAULTLIGHT: a west gallery, a central corridor and the east vault wing.
// The plan is an ASCII map so geometry stays readable; buildLevel turns it into pixel-space
// objects. tools/check-map.mjs proves the border is sealed and everything placed is reachable.
//
// Legend: # wall  . floor  c cover (planter / desk / case: blocks movement and sight)
//         h hiding spot   o loot   S thief start   E getaway   V vault door (decor)

import { TILE, RUN_TIME } from './config.js';

export const MAP = [
  '########################################################',
  '#...................#.......................#.........E#',
  '#.S............h....#.......................#.......o.E#',
  '#.........cc.....cc.#.......................#..........#',
  '#...................#......cc...................cc.....#',
  '#....cc.....................................#..........#',
  '#....cc.............#....o..................#..........#',
  '#...................#.....h......cc.........#.......h..#',
  '#......h............#..................................#',
  '#...................#....................cc....o.......#',
  '########.#######.##...####.#########.####..............#',
  '#......................h...............................#',
  '#........o..............................h.........cc...#',
  '#..h................................cc.................#',
  '#........cc..............cc............................#',
  '#..............................cc............h.........#',
  '#......................................................#',
  '####.########...####.#######h#.####....................#',
  '#......................................................#',
  '#................o....................#####.#######....#',
  '#....cc.......................#.......#...........h....#',
  '#.............#...............#.......#................#',
  '#...........h.#......................h#................#',
  '#.......cc............cc......#.......#.......cc.......#',
  '#..o..........#....h..........#...h.....o...........V..#',
  '########################################################',
];

export const MAP_W = MAP[0].length;
export const MAP_H = MAP.length;
export const PX_W = MAP_W * TILE;
export const PX_H = MAP_H * TILE;

export const TILE_WALL = 1;
export const TILE_COVER = 2;
export const TILE_FLOOR = 0;

export function tileCenter(tx, ty) {
  return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
}

export function tileAt(level, px, py) {
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return TILE_WALL;
  return level.tiles[ty][tx];
}

// Walls and cover block both sight and movement; carpet and hiding spots are open floor.
export function walkable(level, px, py, r = 7) {
  const probes = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, -r * 0.7]];
  for (const [dx, dy] of probes) {
    if (tileAt(level, px + dx, py + dy) !== TILE_FLOOR) return false;
  }
  return true;
}

const LOOT_NAMES = ['Crown Jewels', 'Ledger Plate', 'Black Opal', 'Gold Sceptre', 'Star Ruby', 'Ivory Mask', 'Moon Dial'];

export function buildLevel() {
  const tiles = MAP.map((row) => [...row].map((ch) => (ch === '#' ? TILE_WALL : ch === 'c' ? TILE_COVER : TILE_FLOOR)));
  const places = (ch, fn) => MAP.forEach((row, y) => [...row].forEach((c, x) => { if (c === ch) fn(x, y); }));

  const cover = [];
  const hides = [];
  const loot = [];
  let start = tileCenter(2, 2);
  const exit = tileCenter(54, 1);

  places('c', (x, y) => cover.push({ ...tileCenter(x, y), r: TILE * 0.62 }));
  places('h', (x, y) => hides.push({ ...tileCenter(x, y), used: false }));
  places('o', (x, y) => loot.push({
    ...tileCenter(x, y), taken: false, name: `${LOOT_NAMES[loot.length % LOOT_NAMES.length]} · ${x < 20 ? 'West Wing' : x < 40 ? 'Gallery' : 'East Vault'}`,
  }));
  places('S', (x, y) => { start = tileCenter(x, y); });

  // Guard patrols in tile coordinates. Each guard loops its waypoint ring, pausing at every stop.
  const PATROLS = [
    ['Sentry', [[22, 5], [22, 9], [14, 9], [14, 3], [18, 3]]],
    ['Roundsman', [[22, 2], [41, 2], [41, 9], [22, 9], [31, 5]]],
    ['Watchman', [[46, 10], [53, 10], [53, 18], [46, 18], [49, 14]]],
    ['Cloak', [[4, 12], [18, 12], [18, 16], [4, 16], [10, 14]]],
    ['Rover', [[24, 12], [43, 12], [43, 18], [24, 18], [33, 15]]],
    ['Warden', [[18, 19], [33, 19], [33, 24], [18, 24], [25, 21]]],
  ];
  const guards = PATROLS.map(([name, pts], i) => ({
    id: i, name,
    x: (pts[0][0] + 0.5) * TILE, y: (pts[0][1] + 0.5) * TILE,
    pts: pts.map(([x, y]) => tileCenter(x, y)),
    target: 1, wait: 0, state: 'patrol', facing: -Math.PI / 2,
    alert: 0, searchUntil: 0, searchX: 0, searchY: 0,
  }));

  // Cameras bolted to walls sweep back and forth; EMP knocks each one offline for a few seconds.
  const CAM_SPOTS = [
    [20, 3, Math.PI / 2], [44, 3, Math.PI / 2], [30, 10, -Math.PI / 2],
    [46, 19, Math.PI / 2], [30, 19, -Math.PI / 2], [14, 17, Math.PI / 2],
    [8, 10, -Math.PI / 2], [50, 10, -Math.PI / 2],
  ];
  const cams = CAM_SPOTS.map(([x, y, base], i) => ({
    id: i, ...tileCenter(x, y), base, off: false, offUntil: 0, phase: i * 0.81,
  }));

  return { tiles, cover, hides, loot, guards, cams, start, exit, timeLeft: RUN_TIME };
}
