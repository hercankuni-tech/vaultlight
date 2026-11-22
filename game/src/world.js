// Game rules and state. The pure-ish update is what makes deterministic frame capture possible:
// advance(state, dt, input) with a fixed dt always yields the same state from the same seed.

import { buildLevel, tileAt, TILE_WALL, TILE_COVER } from './level.js';
import { makeRng } from './rng.js';
import { stepVision, empAt, lureAt, clearRay } from './vision.js';
import {
  TILE, LOOT_NEEDED, CAUGHT_AT, WALK, SPRINT, CROUCH, THIEF_R, TOOLS, SMOKE_R, SMOKE_TIME, EMP_TIME,
} from './config.js';

export const PHASE = { BRIEF: 'brief', PLAY: 'play', CAUGHT: 'caught', ESCAPED: 'escaped' };

export function newGame(seed = 20261122) {
  const level = buildLevel();
  const rng = makeRng(seed);
  const tools = Object.fromEntries(TOOLS.map((tool) => [tool.id, tool.count]));
  const state = {
    seed, rng, level, t: 0, phase: PHASE.BRIEF,
    thief: { ...level.start, r: THIEF_R, mode: 'walk', moving: false, facing: 0 },
    guards: level.guards, cams: level.cams,
    alarm: 0, seenByGuard: false, seenByCam: false, hidden: false,
    loot: level.loot, lootTaken: 0, lootNeeded: Math.min(LOOT_NEEDED, level.loot.length),
    tools, smoke: [], heard: null, heardUntil: 0,
    timeLeft: level.timeLeft, flash: 0, lastEvent: '', eventUntil: 0,
    caughtAt: 0, escapedAt: 0, stats: { nearMisses: 0, pings: 0 },
  };
  return state;
}

export function startGame(state) {
  state.phase = PHASE.PLAY;
  event(state, 'Heist underway — reach the getaway with the haul.');
}

function event(state, text, seconds = 3) {
  state.lastEvent = text;
  state.eventUntil = state.t + seconds;
}

function pickupLoot(state) {
  for (const l of state.loot) {
    if (!l.taken && Math.hypot(state.thief.x - l.x, state.thief.y - l.y) < 18) {
      l.taken = true;
      state.lootTaken++;
      event(state, `${l.name} secured  ·  ${state.lootTaken}/${state.lootNeeded}`);
      return true;
    }
  }
  return false;
}

function inExit(state) {
  const e = state.level.exit;
  return Math.hypot(state.thief.x - e.x, state.thief.y - e.y) < 26;
}

export function useTool(state, id) {
  if (state.phase !== PHASE.PLAY || !state.tools[id]) return false;
  state.tools[id]--;
  const thief = state.thief;
  if (id === 'smoke') {
    state.smoke.push({ x: thief.x, y: thief.y, at: state.t, dur: SMOKE_TIME });
    event(state, 'Smoke deployed — line of sight broken.');
  } else if (id === 'emp') {
    empAt(state, thief.x, thief.y, 420);
    event(state, 'EMP burst — cameras dark for a few seconds.');
    state.stats.pings++;
  } else if (id === 'lure') {
    const g = lureAt(state, thief.x + Math.cos(thief.facing) * 150, thief.y + Math.sin(thief.facing) * 150);
    event(state, g ? `${g.name} investigates the noise.` : 'Lure thrown.');
  }
  return true;
}

// One fixed-dt simulation step. Controls: axis vector, sprint and crouch flags, tool presses.
export function advance(state, dt, input) {
  if (state.phase !== PHASE.PLAY) return state;
  state.t += dt;
  state.timeLeft = Math.max(0, state.timeLeft - dt);
  state.flash = Math.max(0, state.flash - dt * 2);

  const thief = state.thief;
  let dx = input.dx || 0;
  let dy = input.dy || 0;
  const len = Math.hypot(dx, dy);
  thief.moving = len > 0.01;
  if (thief.moving) {
    dx /= len; dy /= len;
    thief.facing = Math.atan2(dy, dx);
    thief.mode = input.crouch ? 'crouch' : input.sprint ? 'sprint' : 'walk';
    const speed = thief.mode === 'sprint' ? SPRINT : thief.mode === 'crouch' ? CROUCH : WALK;
    const nx = thief.x + dx * speed * dt;
    const ny = thief.y + dy * speed * dt;
    if (canStand(state.level, nx, ny)) { thief.x = nx; thief.y = ny; }
    else if (canStand(state.level, nx, thief.y)) thief.x = nx;
    else if (canStand(state.level, thief.x, ny)) thief.y = ny;
  } else {
    thief.mode = input.crouch ? 'crouch' : 'walk';
  }

  state.smoke = state.smoke.filter((s) => state.t - s.at < s.dur);
  if (input.tool) useTool(state, input.tool);

  const wasSeen = state.seenByGuard || state.seenByCam;
  stepVision(state.level, state, dt, null);
  const nowSeen = state.seenByGuard || state.seenByCam;
  if (!wasSeen && nowSeen) {
    state.stats.nearMisses++;
    state.flash = 1;
    event(state, 'Spotted! Break line of sight.', 2);
  }

  pickupLoot(state);

  if (state.alarm >= CAUGHT_AT) {
    state.phase = PHASE.CAUGHT;
    state.caughtAt = state.t;
    event(state, 'Alarm tripped — heist failed.', 999);
  } else if (state.timeLeft <= 0) {
    state.phase = PHASE.CAUGHT;
    state.caughtAt = state.t;
    event(state, 'Out of time — the squad sealed the building.', 999);
  } else if (inExit(state)) {
    if (state.lootTaken >= state.lootNeeded) {
      state.phase = PHASE.ESCAPED;
      state.escapedAt = state.t;
      event(state, 'Getaway reached. Clean escape.', 999);
    } else if (state.t > state.eventUntil) {
      event(state, `Getaway locked — need ${state.lootNeeded - state.lootTaken} more item(s).`, 1.5);
    }
  }
  return state;
}

export function canStand(level, x, y) {
  const probes = [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8]];
  for (const [px, py] of probes) {
    const t = tileAt(level, x + px, y + py);
    if (t === TILE_WALL || t === TILE_COVER) return false;
  }
  return true;
}

export function activeSmoke(state) {
  return state.smoke.filter((s) => state.t - s.at < s.dur);
}

export { clearRay };
