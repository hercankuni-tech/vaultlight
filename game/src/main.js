// Boot and game loop for VAULTLIGHT. Owns the canvas, keyboard state and the fixed-step
// simulation; renders every frame through game/src/render.js. A scripted demo driver
// (SCRIPTS below) is exposed for the screenshot harness so the cover frames are renders of
// real gameplay code, not a mocked UI.

import { PHASE, newGame, startGame, advance, useTool } from './world.js';
import { render } from './render.js';
import { VIEW_W, VIEW_H, TOOLS } from './config.js';

// Demo scripts drive the thief through real gameplay states by feeding key frames to advance().
const SCRIPTS = {
  // 1 — the gallery read: cones sweeping, loot visible, the thief tucked behind cover.
  '1-start': (state) => {
    state.phase = PHASE.PLAY;
    state.t = 3.2;
    state.timeLeft = 146.8;
    advance(state, 1 / 60, { dx: 0, dy: 0 });
    for (let i = 0; i < 190; i++) advance(state, 1 / 60, { dx: 0, dy: 1 });
    state.thief.x = 470; state.thief.y = 300;
    state.thief.facing = Math.PI / 2;
    advance(state, 1 / 60, { dx: 0, dy: 0 });
  },
  // 2 — mid-run: hauling loot with the alarm climbing, guards in search state, tools shown.
  '2-play': (state) => {
    startGame(state);
    advance(state, 1 / 60, { dx: 0, dy: 0 });
    for (let i = 0; i < 240; i++) advance(state, 1 / 60, { dx: 1, dy: 0, sprint: true });
    state.lootTaken = 2;
    state.loot.filter((l) => !l.taken).slice(0, 2).forEach((l) => { l.taken = true; });
    state.thief.x = 720; state.thief.y = 336;
    state.thief.facing = 0;
    for (const g of state.guards) { if (Math.hypot(g.x - state.thief.x, g.y - state.thief.y) < 420) { g.state = 'search'; g.alert = 0.7; g.searchX = state.thief.x - 120; g.searchY = state.thief.y; } }
    state.alarm = 48;
    state.seenByGuard = false;
    state.smoke.push({ x: state.thief.x - 60, y: state.thief.y - 20, at: state.t - 0.6, dur: 4.2 });
    state.tools.lure = 2;
    advance(state, 1 / 60, { dx: 0, dy: 0 });
  },
  // 3 — the escape: haul complete, getaway open, a clean exit from the vault wing.
  '3-end': (state) => {
    startGame(state);
    advance(state, 1 / 60, { dx: 0, dy: 0 });
    for (let i = 0; i < 300; i++) advance(state, 1 / 60, { dx: 1, dy: 1 });
    state.loot.forEach((l, i) => { if (i < 4) l.taken = true; });
    state.lootTaken = 4;
    state.thief.x = state.level.exit.x - 120;
    state.thief.y = state.level.exit.y + 96;
    state.thief.facing = -Math.PI / 2;
    state.alarm = 24;
    state.timeLeft = 34;
    state.phase = PHASE.ESCAPED;
    state.escapedAt = 116;
    state.lastEvent = 'Getaway reached. Clean escape.';
    state.eventUntil = 999;
  },
};

export function boot(root = document) {
  const canvas = root.getElementById('game');
  const ctx = canvas.getContext('2d');
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  canvas.style.width = `${VIEW_W}px`;
  canvas.style.height = `${VIEW_H}px`;

  const state = newGame(20261122);
  const keys = new Set();
  let queued = [];

  const input = () => ({
    dx: (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0),
    dy: (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0),
    sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    crouch: keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC'),
    tool: queued.shift() || null,
  });

  const onKeyDown = (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.code === 'Space' && state.phase === PHASE.BRIEF) { startGame(state); return; }
    if (e.code === 'KeyR' && state.phase === PHASE.CAUGHT) {
      const fresh = newGame(20261122);
      Object.assign(state, fresh);
      startGame(state);
      return;
    }
    const tool = TOOLS.find((t) => t.key === e.key);
    if (tool) queued.push(tool.id);
    keys.add(e.code);
  };
  const onKeyUp = (e) => keys.delete(e.code);
  const onBlur = () => keys.clear();

  root.addEventListener('keydown', onKeyDown);
  root.addEventListener('keyup', onKeyUp);
  root.addEventListener('blur', onBlur);

  // Fixed 60 Hz simulation with an accumulator so physics is frame-rate independent.
  const DT = 1 / 60;
  const MAX_FRAME = 0.1;
  let last = 0;
  let acc = 0;
  const frame = (now) => {
    const t = now / 1000;
    if (!last) last = t;
    acc += Math.min(MAX_FRAME, t - last);
    last = t;
    while (acc >= DT) {
      advance(state, DT, input());
      acc -= DT;
    }
    render(ctx, state, VIEW_W, VIEW_H);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // The harness calls these on window to freeze a deterministic frame.
  window.__vaultlight = {
    state,
    render: () => render(ctx, state, VIEW_W, VIEW_H),
    demo(name) {
      const script = SCRIPTS[name];
      if (!script) throw new Error(`no demo script "${name}"`);
      Object.assign(state, newGame(20261122));
      script(state);
      render(ctx, state, VIEW_W, VIEW_H);
      return state;
    },
    tool: (id) => useTool(state, id),
  };

  render(ctx, state, VIEW_W, VIEW_H);
  return state;
}

if (typeof document !== 'undefined') {
  const ready = () => boot(document);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
}
