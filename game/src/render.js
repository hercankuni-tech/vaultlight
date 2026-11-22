// Canvas renderer. Everything drawn here comes from game/src + the level data — no images, no
// fonts, no network. Cones are hard-cut by cover (the same raycast the AI uses), safe cover is
// teal, danger is red/amber, loot is the brightest gold in the room.
//
// drawGame is exported so the headless screenshot tool can drive exactly the same code path as
// the browser does: render(state, ctx, w, h) is the only thing between a state and a frame.

import { C, TILE, VIEW_W, VIEW_H, GUARD_VIEW, GUARD_FOV, CAM_VIEW, CAM_FOV, SMOKE_R, TOOLS } from './config.js';
import { MAP_W, MAP_H, tileAt, TILE_COVER, TILE_WALL } from './level.js';
import { PHASE } from './world.js';

const TAU = Math.PI * 2;

export function render(ctx, state, w = VIEW_W, h = VIEW_H) {
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  drawBackdrop(ctx, w, h, state);

  // The playfield is letterboxed to keep the 56x26 map's aspect ratio at 1280x720.
  const scale = Math.min(w / VIEW_W, (h - 74) / (MAP_H * TILE));
  const fw = MAP_W * TILE * scale;
  const fh = MAP_H * TILE * scale;
  const ox = (w - fw) / 2;
  const oy = 68 + (h - 74 - fh) / 2;
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  drawFloor(ctx, state);
  drawConeLayer(ctx, state);
  drawLoot(ctx, state);
  drawHides(ctx, state);
  drawSmoke(ctx, state);
  drawGuards(ctx, state);
  drawCameras(ctx, state);
  drawThief(ctx, state);
  drawWorldHud(ctx, state, scale);
  ctx.restore();

  drawChrome(ctx, state, w, h, ox, oy, fw, fh);
}

function drawBackdrop(ctx, w, h, state) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0a0e18');
  g.addColorStop(1, '#05070c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Faint vault-blueprint grid behind the world.
  ctx.strokeStyle = 'rgba(70,100,140,0.07)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); }
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,60,40,${state.flash * 0.16})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawFloor(ctx, state) {
  const L = state.level;
  ctx.fillStyle = C.night;
  ctx.fillRect(0, 0, MAP_W * TILE, MAP_H * TILE);
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const t = L.tiles[ty][tx];
      const x = tx * TILE, y = ty * TILE;
      if (t === TILE_WALL) {
        ctx.fillStyle = C.wall;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = C.wallTop;
        ctx.fillRect(x + 1, y + 1, TILE - 2, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.26)';
        ctx.fillRect(x + 1, y + TILE - 4, TILE - 2, 3);
      } else {
        ctx.fillStyle = (tx + ty) % 2 ? C.floor : '#101623';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = C.floorGrid;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      }
    }
  }
  // Hatching for carpet strips and the vault boundary, drawn as world decor.
  ctx.fillStyle = C.carpet;
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      if (L.tiles[ty][tx] === 0 && ((tx * 7 + ty * 11) % 37 < 3)) ctx.fillRect(tx * TILE + 3, ty * TILE + 3, TILE - 6, TILE - 6);
    }
  }
  // Cover blocks: teal, low and obviously safe to hide behind.
  for (const c of L.cover) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(c.x - TILE * 0.6 + 3, c.y - TILE * 0.6 + 4, TILE * 1.2, TILE * 1.2);
    ctx.fillStyle = C.cover;
    ctx.fillRect(c.x - TILE * 0.58, c.y - TILE * 0.58, TILE * 1.16, TILE * 1.16);
    ctx.fillStyle = C.coverEdge;
    ctx.fillRect(c.x - TILE * 0.58, c.y - TILE * 0.58, TILE * 1.16, 3);
    ctx.strokeStyle = 'rgba(125,249,193,0.24)';
    ctx.strokeRect(c.x - TILE * 0.58, c.y - TILE * 0.58, TILE * 1.16, TILE * 1.16);
  }
  // Getaway zone and vault door.
  const e = L.exit;
  ctx.fillStyle = 'rgba(125,249,193,0.10)';
  ctx.beginPath(); ctx.arc(e.x, e.y, 28, 0, TAU); ctx.fill();
  ctx.strokeStyle = state.lootTaken >= state.lootNeeded ? C.accent : C.uiDim;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.arc(e.x, e.y, 24, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = state.lootTaken >= state.lootNeeded ? C.accent : C.uiDim;
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('EXIT', e.x, e.y + 3);
}

// Draw every cone clipped by the same clearRay the guards use, so what the player sees and what
// the AI sees agree exactly. This is the heart of the "read the cone before you move" loop.
function cone(ctx, state, viewer, fov, view, color, off = false) {
  if (off) return;
  const steps = 34;
  ctx.beginPath();
  ctx.moveTo(viewer.x, viewer.y);
  for (let i = 0; i <= steps; i++) {
    const a = viewer.facing - fov / 2 + (i / steps) * fov;
    let reach = view;
    // Step along the ray until solid cover; mirrors clearRay's 6px march.
    for (let d = 6; d <= view; d += 6) {
      const px = viewer.x + Math.cos(a) * d;
      const py = viewer.y + Math.sin(a) * d;
      if (tileAt(state.level, px, py) !== 0) { reach = d - 3; break; }
    }
    ctx.lineTo(viewer.x + Math.cos(a) * reach, viewer.y + Math.sin(a) * reach);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawConeLayer(ctx, state) {
  for (const c of state.cams) cone(ctx, state, c, CAM_FOV, CAM_VIEW, c.off ? 'rgba(120,130,150,0.04)' : 'rgba(255,176,46,0.14)', false);
  for (const g of state.guards) {
    const col = g.alert > 0.6 ? C.coneCaught : g.state === 'search' ? C.coneAlert : C.coneSafe;
    cone(ctx, state, g, GUARD_FOV, GUARD_VIEW, col);
  }
}

function drawLoot(ctx, state) {
  const pulse = 0.65 + 0.35 * Math.sin(state.t * 3.4);
  for (const l of state.loot) {
    if (l.taken) continue;
    ctx.fillStyle = C.lootGlow;
    ctx.beginPath(); ctx.arc(l.x, l.y, 14 + pulse * 5, 0, TAU); ctx.fill();
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.rotate(state.t * 0.7 + l.x * 0.01);
    ctx.fillStyle = C.loot;
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(6, 0); ctx.lineTo(0, 7); ctx.lineTo(-6, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff3c0';
    ctx.beginPath(); ctx.arc(0, 0, 2, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function drawHides(ctx, state) {
  for (const h of state.level.hides) {
    ctx.strokeStyle = 'rgba(43,108,176,0.75)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(h.x, h.y, 11, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(43,108,176,0.45)';
    ctx.beginPath(); ctx.arc(h.x, h.y, 4, 0, TAU); ctx.fill();
  }
}

function drawSmoke(ctx, state) {
  for (const s of state.smoke) {
    const age = state.t - s.at;
    const r = SMOKE_R * Math.min(1, 0.5 + age * 0.8);
    const alpha = Math.max(0, 1 - age / s.dur);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + age * 0.3;
      ctx.fillStyle = `rgba(170,200,215,${0.13 * alpha})`;
      ctx.beginPath();
      ctx.arc(s.x + Math.cos(a) * r * 0.45, s.y + Math.sin(a) * r * 0.45, r * 0.55, 0, TAU);
      ctx.fill();
    }
  }
}

function drawGuards(ctx, state) {
  for (const g of state.guards) {
    const alert = g.alert > 0.6;
    const col = alert ? C.guardAlert : C.guard;
    // Soft shadow, body, facing notch.
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(g.x + 2, g.y + 3, 10, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(g.x, g.y, 8.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd9cf';
    ctx.beginPath(); ctx.arc(g.x, g.y, 3.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.x + Math.cos(g.facing) * 13, g.y + Math.sin(g.facing) * 13); ctx.stroke();
    if (g.state === 'search') {
      ctx.strokeStyle = C.guardAlert;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(g.x, g.y, 13, 0, TAU); ctx.stroke();
      ctx.fillStyle = C.guardAlert;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('?', g.x, g.y - 15);
    }
  }
}

function drawCameras(ctx, state) {
  for (const c of state.cams) {
    const col = c.off ? C.cameraOff : C.camera;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(c.x - 8, c.y - 8, 16, 16);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(c.x, c.y, 6, 0, TAU); ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + Math.cos(c.facing) * 14, c.y + Math.sin(c.facing) * 14);
    ctx.stroke();
    if (c.off) {
      ctx.strokeStyle = C.cameraOff;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(c.x - 4, c.y - 4); ctx.lineTo(c.x + 4, c.y + 4); ctx.stroke();
    }
  }
}

function drawThief(ctx, state) {
  const t = state.thief;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath(); ctx.ellipse(t.x + 2, t.y + 3, 9, 5, 0, 0, TAU); ctx.fill();
  const glow = state.hidden ? C.accent : C.thief;
  ctx.strokeStyle = glow;
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(t.x, t.y, 14, 0, TAU); ctx.stroke();
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(t.x, t.y, 7.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#081018';
  ctx.beginPath(); ctx.arc(t.x, t.y, 3, 0, TAU); ctx.fill();
  ctx.strokeStyle = glow;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x + Math.cos(t.facing) * 12, t.y + Math.sin(t.facing) * 12); ctx.stroke();
}

function drawWorldHud(ctx, state, scale) {
  // World-space objective marker over the next uncollected loot.
  const next = state.loot.find((l) => !l.taken);
  if (next) {
    ctx.fillStyle = C.loot;
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('◆ LOOT', next.x, next.y - 16);
  }
}

// Fixed-position chrome: title strip, alarm meter, clock, tool belt, objective readout.
// Everything a judge needs to see in one frame lives in this function.
export function drawChrome(ctx, state, w, h, ox, oy, fw, fh) {
  // Reset the world-space text state: drawWorldHud left textAlign centred, which would clip
  // the title off the left edge.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(10,14,24,0.94)';
  ctx.fillRect(0, 0, w, 62);
  ctx.strokeStyle = 'rgba(125,249,193,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 61.5); ctx.lineTo(w, 61.5); ctx.stroke();

  ctx.fillStyle = C.accent;
  ctx.font = 'bold 24px monospace';
  ctx.fillText('VAULTLIGHT', 22, 30);
  ctx.fillStyle = C.uiDim;
  ctx.font = '11px monospace';
  ctx.fillText('A NIGHT HEIST · WEST GALLERY', 22, 48);

  // Alarm meter: full-width, colour escalates, numeric readout.
  const alarm = Math.round(state.alarm);
  const ax = 340, ay = 14, aw = 430, ah = 18;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(ax, ay, aw, ah);
  const danger = alarm > 70 ? C.bad : alarm > 35 ? C.camera : C.accent;
  ctx.fillStyle = danger;
  ctx.fillRect(ax + 2, ay + 2, Math.max(0, (aw - 4) * alarm / 100), ah - 4);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.strokeRect(ax + 0.5, ay + 0.5, aw, ah);
  ctx.fillStyle = C.ui;
  ctx.font = 'bold 12px monospace';
  ctx.fillText(`ALARM ${String(alarm).padStart(3, ' ')}%`, ax, ay + 33);
  ctx.fillStyle = danger;
  ctx.fillText(state.seenByGuard ? '◉ GUARD SIGHT' : state.seenByCam ? '◉ CAMERA SIGHT' : state.hidden ? '◍ HIDDEN' : '○ UNSEEN', ax + 130, ay + 33);

  // Clock and loot counter.
  ctx.fillStyle = C.ui;
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  const secs = Math.max(0, Math.ceil(state.timeLeft));
  ctx.fillText(`${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`, w - 210, 30);
  ctx.fillStyle = C.loot;
  ctx.font = 'bold 16px monospace';
  ctx.fillText(`◆ ${state.lootTaken}/${state.lootNeeded}`, w - 90, 30);
  ctx.fillStyle = C.uiDim;
  ctx.font = '10px monospace';
  ctx.fillText('HAUL', w - 90, 46);

  // Bottom panel: tool belt, controls, objective line, phase result banner.
  const by = h - 52;
  ctx.fillStyle = 'rgba(10,14,24,0.96)';
  ctx.fillRect(0, by, w, 52);
  ctx.strokeStyle = 'rgba(125,249,193,0.22)';
  ctx.beginPath(); ctx.moveTo(0, by + 0.5); ctx.lineTo(w, by + 0.5); ctx.stroke();

  TOOLS.forEach((tool, i) => {
    const x = 20 + i * 168;
    const n = state.tools[tool.id];
    ctx.fillStyle = n > 0 ? 'rgba(125,249,193,0.13)' : 'rgba(255,255,255,0.04)';
    ctx.fillRect(x, by + 8, 156, 36);
    ctx.strokeStyle = n > 0 ? C.accent : 'rgba(255,255,255,0.12)';
    ctx.strokeRect(x + 0.5, by + 8.5, 155, 35);
    ctx.fillStyle = n > 0 ? C.accent : C.uiDim;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`[${tool.key}] ${tool.name} ×${n}`, x + 8, by + 31);
  });

  ctx.fillStyle = C.uiDim;
  ctx.font = '11px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('WASD move · SHIFT sprint · CTRL crouch · 1/2/3 tools · SPACE begin', w - 20, h - 29);
  ctx.fillStyle = C.ui;
  ctx.fillText(state.t < state.eventUntil ? state.lastEvent : 'Take the haul. Read the cones. Reach the getaway.', w - 20, h - 11);

  // Brief / result overlay sits over the world but under the chrome.
  if (state.phase !== PHASE.PLAY) {
    const banner = state.phase === PHASE.BRIEF ? 'PLAN THE ROUTE' : state.phase === PHASE.CAUGHT ? 'CAUGHT' : 'CLEAN GETAWAY';
    ctx.fillStyle = state.phase === PHASE.ESCAPED ? 'rgba(6,24,20,0.80)' : state.phase === PHASE.CAUGHT ? 'rgba(34,6,8,0.80)' : 'rgba(6,10,18,0.78)';
    ctx.fillRect(ox + fw * 0.18, oy + fh * 0.34, fw * 0.64, 130);
    ctx.strokeStyle = state.phase === PHASE.ESCAPED ? C.accent : state.phase === PHASE.CAUGHT ? C.bad : C.thief;
    ctx.lineWidth = 2;
    ctx.strokeRect(ox + fw * 0.18, oy + fh * 0.34, fw * 0.64, 130);
    ctx.textAlign = 'center';
    ctx.fillStyle = state.phase === PHASE.ESCAPED ? C.accent : state.phase === PHASE.CAUGHT ? C.bad : C.thief;
    ctx.font = 'bold 38px monospace';
    ctx.fillText(banner, w / 2, oy + fh * 0.34 + 56);
    ctx.fillStyle = C.ui;
    ctx.font = '15px monospace';
    const sub = state.phase === PHASE.BRIEF
      ? 'Press SPACE to slip into the gallery'
      : state.phase === PHASE.ESCAPED
        ? `${state.lootTaken} pieces in ${Math.round(state.escapedAt)}s · alarm ${Math.round(state.alarm)}%`
        : `Alarm hit ${Math.round(state.alarm)}% · ${state.lootTaken}/${state.lootNeeded} secured`;
    ctx.fillText(sub, w / 2, oy + fh * 0.34 + 94);
  }
  ctx.restore();
}
