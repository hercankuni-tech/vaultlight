// Seeded deterministic RNG (mulberry32). Every random thing in VAULTLIGHT pulls from a
// seeded stream so a given seed always produces the same run — same patrols, same sweep
// phases, same loot. Determinism is what lets the screenshot harness freeze a frame.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Small helper: a stream object with the helpers the game actually uses.
export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    seed,
    next,
    range(lo, hi) {
      return lo + next() * (hi - lo);
    },
    int(lo, hi) {
      return Math.floor(lo + next() * (hi - lo + 1));
    },
    pick(arr) {
      return arr[Math.floor(next() * arr.length) % arr.length];
    },
  };
}
