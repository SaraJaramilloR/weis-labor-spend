/** mulberry32: small deterministic PRNG so every demo and test shows the same synthetic figures. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform value in [min, max). */
export const between = (rnd: () => number, min: number, max: number) => min + (max - min) * rnd();

/** Approximately normal noise (sum of uniforms), mean 0 and the given standard deviation. */
export function noise(rnd: () => number, sd: number): number {
  let s = 0;
  for (let i = 0; i < 6; i++) s += rnd();
  return (s - 3) * sd * Math.SQRT2;
}

/** Stable string hash used to derive per-entity seeds. */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
