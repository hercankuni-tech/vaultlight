// Line of sight and awareness. A cone is only dangerous where the ray can actually reach —
// cover cuts it, which is the core read of the game. Guards escalate patrol → search → alert.
// Nothing here reads the clock directly: everything is driven by dt so a frozen frame is stable.

import {
  GUARD_FOV, GUARD_VIEW, GUARD_SPEED, GUARD_ALERT_SPEED, GUARD_PAUSE, SEARCH_TIME, SPOT_RANGE,
  CAM_FOV, CAM_VIEW, CAM_SWEEP, CAM_PERIOD, ALARM_DECAY, HIDE_RANGE, SEEN_RATE, CAMERA_SPOT_RATE,
  CROUCH_NOISE, SPRINT_NOISE, SMOKE_R, EMP_TIME, THIEF_R,
} from './config.js';
import { tileAt, TILE_WALL, TILE_COVER } from './level.js';

// March a ray in small steps; return true if nothing solid is hit before maxDist.
export function clearRay(level, x1, y1, x2, y2, maxDist) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.min(maxDist, Math.hypot(dx, dy));
  if (dist <= 0) return true;
  const steps = Math.ceil(dist / 6);
  if (steps <= 0) return true;
  const ux = dx / Math.hypot(dx, dy);
  const uy = dy / Math.hypot(dx, dy);
  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * dist;
    // Cover is as opaque to sight as a wall: the thief is safe only when truly out of view.
    if (tileAt(level, x1 + ux * t, y1 + uy * t) !== 0) return false;
  }
  return true;
}

// Is the thief hidden by a hiding spot, smoke, or plain distance from every viewer?
export function isHidden(level, thief, smoke, t) {
  for (const h of level.hides) {
    if (Math.hypot(thief.x - h.x, thief.y - h.y) < HIDE_RANGE && !thief.moving) return true;
  }
  for (const s of smoke) {
    if (t - s.at < s.dur && Math.hypot(thief.x - s.x, thief.y - s.y) < SMOKE_R) return true;
  }
  return false;
}

function angleDelta(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

// Does a viewer's cone hold the thief right now?
export function coneSees(level, viewer, thief, fov, range, opts = {}) {
  if (opts.off) return false;
  const dist = Math.hypot(thief.x - viewer.x, thief.y - viewer.y);
  if (dist > range) return false;
  const a = Math.atan2(thief.y - viewer.y, thief.x - viewer.x);
  if (Math.abs(angleDelta(a, viewer.facing)) > fov / 2) return false;
  return clearRay(level, viewer.x, viewer.y, thief.x, thief.y, range);
}

function walkGuard(level, g, tx, ty, speed, dt) {
  const dx = tx - g.x;
  const dy = ty - g.y;
  const d = Math.hypot(dx, dy);
  if (d < 4) return true;
  const nx = g.x + (dx / d) * speed * dt;
  const ny = g.y + (dy / d) * speed * dt;
  // Try the direct step, then slide along each axis so guards never stick on a corner.
  if (walkableSpace(level, nx, ny)) {
    g.x = nx; g.y = ny;
  } else if (walkableSpace(level, nx, g.y)) {
    g.x = nx;
  } else if (walkableSpace(level, g.x, ny)) {
    g.y = ny;
  }
  g.facing = Math.atan2(dy, dx);
  return false;
}

function walkableSpace(level, x, y) {
  return tileAt(level, x, y) !== TILE_WALL && tileAt(level, x, y) !== TILE_COVER;
}

// Move one guard along its patrol or toward a noise, and update alert state.
function stepGuard(level, g, thief, dt, t, hidden, heard) {
  let saw = false;
  const dist = Math.hypot(thief.x - g.x, thief.y - g.y);

  if (!hidden && coneSees(level, g, thief, GUARD_FOV, GUARD_VIEW)) saw = true;
  // Close enough and in plain sight: a guard simply spots you, cone or no cone.
  if (!hidden && dist < SPOT_RANGE * 0.42 && clearRay(level, g.x, g.y, thief.x, thief.y, GUARD_VIEW)) saw = true;

  if (heard && Math.hypot(heard.x - g.x, heard.y - g.y) < 460) {
    g.state = 'search';
    g.searchUntil = t + SEARCH_TIME;
    g.searchX = heard.x;
    g.searchY = heard.y;
    g.alert = Math.max(g.alert, 0.55);
  }

  if (saw) {
    g.state = 'search';
    g.searchUntil = t + SEARCH_TIME;
    g.searchX = thief.x;
    g.searchY = thief.y;
    g.alert = 1;
  }

  if (g.state === 'patrol') {
    if (g.wait > 0) {
      g.wait -= dt;
      // Slow sweep of the head while stopped makes each waypoint tense.
      g.facing += Math.sin(t * 1.7 + g.id) * dt * 0.5;
    } else {
      const p = g.pts[g.target % g.pts.length];
      if (walkGuard(level, g, p.x, p.y, GUARD_SPEED, dt)) {
        g.target = (g.target + 1) % g.pts.length;
        g.wait = GUARD_PAUSE;
      }
    }
  } else {
    g.alert = Math.max(0, g.alert - dt * 0.16);
    const speed = g.alert > 0.6 ? GUARD_ALERT_SPEED : GUARD_SPEED;
    const reached = walkGuard(level, g, g.searchX, g.searchY, speed, dt);
    if (reached || t > g.searchUntil) {
      g.state = 'return';
    }
  }

  if (g.state === 'return') {
    const p = g.pts[g.target % g.pts.length];
    if (walkGuard(level, g, p.x, p.y, GUARD_SPEED, dt)) g.state = 'patrol';
  }

  return saw;
}

// The whole awareness pass: return alarm delta and per-guard/camera "seeing" flags for rendering.
export function stepVision(level, state, dt, heard) {
  const { thief, guards, cams, t } = state;
  const hidden = isHidden(level, thief, state.smoke, t);
  let sawByGuard = false;
  let sawByCam = false;

  for (const g of guards) {
    const saw = stepGuard(level, g, thief, dt, t, hidden, heard);
    if (saw) sawByGuard = true;
  }

  for (const c of cams) {
    if (c.off && t > c.offUntil) c.off = false;
    c.facing = c.base + Math.sin((t / CAM_PERIOD) * Math.PI * 2 + c.phase) * CAM_SWEEP;
    if (!hidden && !c.off && coneSees(level, c, thief, CAM_FOV, CAM_VIEW)) sawByCam = true;
  }

  let delta = 0;
  if (!hidden) {
    if (sawByGuard) delta += SEEN_RATE;
    if (sawByCam) delta += CAMERA_SPOT_RATE;
    if (!sawByGuard && !sawByCam) {
      delta -= ALARM_DECAY;
      if (thief.moving && thief.mode === 'sprint') delta += SPRINT_NOISE;
      if (thief.mode === 'crouch') delta += CROUCH_NOISE;
    }
  } else {
    delta -= ALARM_DECAY * 1.5;
  }
  if (thief.mode === 'sprint' && thief.moving && !hidden) delta += SPRINT_NOISE;
  state.hidden = hidden;
  state.seenByGuard = sawByGuard;
  state.seenByCam = sawByCam;
  state.alarm = Math.max(0, Math.min(100, state.alarm + delta * dt));
  return state.alarm;
}

// Knock out cameras near a point (EMP).
export function empAt(state, x, y, radius) {
  for (const c of state.level.cams) {
    if (Math.hypot(c.x - x, c.y - y) < radius) {
      c.off = true;
      c.offUntil = state.t + EMP_TIME;
    }
  }
}

// Pull the nearest guard toward a noise (lure).
export function lureAt(state, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const g of state.guards) {
    const d = Math.hypot(g.x - x, g.y - y);
    if (d < bestD) { best = g; bestD = d; }
  }
  if (best) {
    best.state = 'search';
    best.searchX = x;
    best.searchY = y;
    best.searchUntil = state.t + SEARCH_TIME;
    best.alert = 0.55;
  }
  return best;
}

export { clearRay as lineOfSight };
export { EMP_TIME, THIEF_R };
