// Node-only test helpers (node: imports are allowed here, never in src/).
import { createHash } from 'node:crypto';

export function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function text(fixture) {
  return JSON.stringify(fixture);
}

/** Deterministic Fisher-Yates shuffle with a seeded LCG. */
export function seededShuffle(array, seed = 42) {
  const out = [...array];
  let s = seed >>> 0;
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const FIXED_TIME = '2026-11-04T00:00:00.000Z';
