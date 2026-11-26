// Course, archipelago and aircraft tuning for Skyreef Run. Units are metres and seconds in the
// simulation; the HUD converts altitude to feet and speed to knots. Everything here is fixed so a
// seedless scenery generator can stay deterministic.

export const STEP = 1 / 120;
export const COURSE_TIME = 180;

/** Where the Kestrel begins: airborne over the south end of the airstrip, pointed up the reef. */
export const START = {
  x: 0,
  y: 170,
  z: 1960,
  heading: 0,
  pitch: 0.025,
  roll: 0,
  speed: 104,
  throttle: 0.72,
};

/**
 * Five gates make a loop around the islands. Each gate's plane is square to the leg of the course
 * that leads into it; the normal is computed in flight.js from the previous gate.
 */
export const RINGS = [
  { x: 0, y: 178, z: 840, radius: 32 },
  { x: 150, y: 310, z: 260, radius: 32 },
  { x: -250, y: 455, z: -250, radius: 32 },
  { x: -1330, y: 300, z: 820, radius: 32 },
  { x: 710, y: 268, z: 320, radius: 32 },
];

/**
 * The archipelago. `height` is the height of the tallest central ridge. `flat` islands are low
 * shelves used for the airstrip and its approaches.
 */
export const ISLANDS = [
  { x: 0, z: -100, rx: 500, rz: 430, height: 392, seed: 11, snow: true, trees: 520 },
  { x: 0, z: 1420, rx: 248, rz: 680, height: 13, seed: 33, flat: true, trees: 470 },
  { x: -1040, z: 560, rx: 330, rz: 310, height: 286, seed: 23, snow: false, trees: 210 },
  { x: -470, z: -1080, rx: 390, rz: 360, height: 348, seed: 71, snow: true, trees: 260 },
  { x: 980, z: -430, rx: 300, rz: 280, height: 214, seed: 43, snow: false, trees: 170 },
  { x: 470, z: 650, rx: 155, rz: 165, height: 92, seed: 53, snow: false, trees: 70 },
  { x: 1460, z: 610, rx: 300, rz: 280, height: 205, seed: 61, snow: false, trees: 150 },
  { x: -820, z: 1610, rx: 260, rz: 250, height: 165, seed: 83, snow: false, trees: 90 },
];

/** Runway deck in world coordinates. */
export const RUNWAY = {
  x: 0,
  z: 1420,
  width: 36,
  length: 720,
  deck: 19.4,
};

/** Sun from the south-west, warm late-afternoon light. */
export const SUN_DIR = { x: -0.56, y: 0.42, z: 0.52 };

export const PALETTE = {
  cyan: '#7ef1ff',
  cyanSoft: '#a5f7ff',
  amber: '#ffb45c',
  gold: '#ffd36e',
  mint: '#8df7d0',
  red: '#ff6b5e',
  ink: '#eaf8ff',
  muted: '#8fb3c1',
  deep: '#041019',
};

export const AIRCRAFT_NAME = 'Kestrel KR-7';
export const AIRCRAFT_CALLSIGN = 'TERN';
export const GAME_TITLE = 'SKYREEF RUN';
export const BEST_KEY = 'skyreef.best-time';
