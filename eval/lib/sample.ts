/** 確認用の一覧で、一致したものから選ぶときの種（仕様 5.3） */
export const REVIEW_SEED = 20261017;

/** 種で決まる乱数（mulberry32）。同じ種なら同じ並びになる */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** items から n 件を種で固定して選び、元の並び順で返す */
export function seededSample<T>(items: readonly T[], n: number, seed: number): T[] {
  const random = mulberry32(seed);
  const indexes = items.map((_, i) => i);
  for (let i = indexes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const kept = indexes[i] as number;
    indexes[i] = indexes[j] as number;
    indexes[j] = kept;
  }
  return indexes
    .slice(0, n)
    .sort((a, b) => a - b)
    .map((i) => items[i] as T);
}
