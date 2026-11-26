// Small deterministic helpers used for island heights, colour variation and prop placement.
// Value noise is enough here: it is cheap, reproducible and its soft ridges read well as terrain.

export function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Mulberry32, a compact seeded generator. Returns numbers in [0, 1). */
export function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** One octave of smoothly interpolated value noise in [0, 1]. */
export function valueNoise(x, z, seed) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = x - x0;
  const tz = z - z0;
  const ux = tx * tx * (3 - 2 * tx);
  const uz = tz * tz * (3 - 2 * tz);
  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

/** Four octaves of value noise, each half the weight of the one before. */
export function fbm(x, z, seed, octaves = 4) {
  let sum = 0;
  let amplitude = 0.5;
  let total = 0;
  let fx = x;
  let fz = z;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += valueNoise(fx, fz, seed + octave * 17) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    fx *= 2.03;
    fz *= 1.97;
  }
  return sum / total;
}
