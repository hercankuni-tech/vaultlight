// Tunable numbers and the colour language of VAULTLIGHT: every magnitude and every colour the
// rest of the game draws lives here so the look reads at a glance — safe cover cool and dark,
// danger warm and loud, loot the brightest thing on screen.

export const TILE = 24;
export const VIEW_W = 1280;
export const VIEW_H = 720;

// Run shape.
export const RUN_TIME = 150; // seconds on the clock
export const LOOT_NEEDED = 3; // loot to grab before the exit will open the getaway
export const CAUGHT_AT = 100; // alarm value that ends the run

// Thief.
export const WALK = 132; // px/s
export const SPRINT = 214; // px/s, loud: raises the alarm while moving fast
export const CROUCH = 74; // px/s, quiet
export const THIEF_R = 8;
export const SPRINT_NOISE = 2.4; // alarm/sec while sprinting in the open
export const CROUCH_NOISE = -3.2; // alarm/sec while crouched and unseen

// Alarm.
export const SEEN_RATE = 34; // alarm/sec while a cone holds the thief
export const CAMERA_SPOT_RATE = 26; // alarm/sec under a camera
export const ALARM_DECAY = 7; // alarm/sec while nothing sees the thief
export const HIDE_RANGE = 26; // px from a hiding spot to be considered hidden
export const SPOT_RANGE = 132; // px at which a searching guard simply catches the thief

// Guards.
export const GUARD_R = 9;
export const GUARD_SPEED = 66;
export const GUARD_ALERT_SPEED = 104;
export const GUARD_FOV = (68 * Math.PI) / 180;
export const GUARD_VIEW = 300; // px, cut short by walls
export const GUARD_PAUSE = 0.9; // s at each waypoint
export const SEARCH_TIME = 6.5; // s a guard investigates before returning to patrol

// Cameras.
export const CAM_FOV = (56 * Math.PI) / 180;
export const CAM_VIEW = 250;
export const CAM_SWEEP = 1.6; // radians of the sweep
export const CAM_PERIOD = 5.2; // s for a full sweep
export const EMP_TIME = 6.5; // s an EMP kills a camera

// Tools.
export const TOOLS = [
  { key: '1', id: 'smoke', name: 'SMOKE', count: 2, hint: 'breaks line of sight around the thief' },
  { key: '2', id: 'emp', name: 'EMP', count: 2, hint: 'kills cameras for a few seconds' },
  { key: '3', id: 'lure', name: 'LURE', count: 3, hint: 'the nearest guard walks to the noise' },
];
export const SMOKE_R = 78;
export const SMOKE_TIME = 4.2;
export const LURE_RANGE = 460;

// Palette.
export const C = {
  night: '#070a12',
  floor: '#131926',
  floorGrid: '#1a2233',
  carpet: '#2a1a2e',
  wall: '#39465e',
  wallTop: '#4d5f80',
  cover: '#1f4d46', // planters, desks, lockers: safe cover
  coverEdge: '#2f7f70',
  guard: '#e0473a',
  guardAlert: '#ff7a2f',
  coneSafe: 'rgba(224,71,58,0.13)',
  coneAlert: 'rgba(255,122,47,0.24)',
  coneCaught: 'rgba(255,60,40,0.32)',
  camera: '#ffb02e',
  cameraOff: '#5b6472',
  loot: '#ffd23f',
  lootGlow: 'rgba(255,210,63,0.30)',
  thief: '#6ee7ff',
  hide: '#2b6cb0',
  ui: '#dfe7f5',
  uiDim: '#8794ad',
  accent: '#7df9c1',
  bad: '#ff5d4d',
};
