// Mulberry32 seeded PRNG — deterministic, fast, replay-safe.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeSeed() {
  return (Math.random() * 0xFFFFFFFF) >>> 0;
}

// xmur3 string hash — used to derive a stable per-test sub-seed from
// (masterSeed, testId) so each test's randomness is fully self-contained.
// This means replay is exact regardless of test execution order,
// cancellation, or which subset of tests actually ran — unlike a single
// shared RNG stream, where skipping or reordering any test would desync
// every test that runs after it.
export function deriveSeed(masterSeed, label) {
  let h = 1779033703 ^ String(label).length;
  const str = `${masterSeed}:${label}`;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

export class SeededRandom {
  constructor(seed) {
    this.seed = seed >>> 0;
    this._rand = mulberry32(this.seed);
  }
  float() { return this._rand(); }
  int(min, max) { return Math.floor(this.float() * (max - min + 1)) + min; }
  pick(arr) { return arr[this.int(0, arr.length - 1)]; }
  bool(p = 0.5) { return this.float() < p; }
  string(len = 8) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let s = '';
    for (let i = 0; i < len; i++) s += chars[this.int(0, chars.length - 1)];
    return s;
  }
  color() {
    return `hsl(${this.int(0, 359)}, ${this.int(40, 90)}%, ${this.int(35, 65)}%)`;
  }
}
